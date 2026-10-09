import { copyFileSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { startReviewServer } from '../../src/lib/server.ts'
import { writeJson } from '../../src/lib/runs.ts'

const out = 'design-research/field-validation'
const source = JSON.parse(readFileSync(join(out, 'real-app-run.json'), 'utf8'))
const root = mkdtempSync(join(process.cwd(), out, '.design-spine/runs/real-scale-'))
const dir = join(root, 'runs/current'), baselines = join(root, 'baselines')
mkdirSync(dir, { recursive: true }); mkdirSync(baselines)
const tiles = Array.from({ length: 240 }, (_, i) => {
  const tile = source.tiles[i % source.tiles.length]
  const file = `replica-${i}.png`
  copyFileSync(join(out, `app-${tile.file}`), join(dir, file))
  copyFileSync(join(out, `app-${tile.file}`), join(baselines, file))
  return { ...tile, id: `${tile.id}-replica-${i}`, file }
})
writeJson(join(dir, 'run.json'), { ...source, id: 'real-capture-replicas', tiles })
writeJson(join(dir, 'review.json'), { tiles: {} })
const server = startReviewServer(dir, 0), base = `http://localhost:${server.port}`, start = performance.now()
const report: any = { root, uniqueImages: 24, tiles: 240, saves: [], failures: [], scope: 'Ten copies of each of the 24 real anonymous public-page captures, not 240 unique pages. 100ms sampled process RSS, not an exact allocation peak. One comparison; no duration or production-percentile claim.' }
function osRssBytes(): number {
  const result = Bun.spawnSync(['ps', '-o', 'rss=', '-p', String(process.pid)])
  if (result.exitCode !== 0) throw new Error('Unable to read OS resident memory')
  return Number(result.stdout.toString().trim()) * 1024
}
let peakSampledRssBytes = 0, pending = false, sequence = 0
const jobs: Promise<void>[] = []
const sampler = setInterval(() => {
  const rss = process.memoryUsage().rss; peakSampledRssBytes = Math.max(peakSampledRssBytes, rss)
  if (rss > 2.5 * 1024 ** 3) {
    report.failures.push('Memory ceiling exceeded'); report.peakSampledRssBytes = peakSampledRssBytes
    writeJson(join(out, 'real-scale-results.json'), report); process.exit(3)
  }
}, 100)
const saver = setInterval(() => {
  if (pending) return
  pending = true
  jobs.push((async () => {
    const note = `real-scale-${++sequence}`, before = performance.now()
    try {
      const response = await fetch(base + '/api/review', { method: 'POST', body: JSON.stringify({ tileId: tiles[0].id, note }) })
      if (!response.ok || (await response.json()).note !== note) throw new Error('Save response mismatch')
      if (JSON.parse(readFileSync(join(dir, 'review.json'), 'utf8')).tiles[tiles[0].id].note !== note) throw new Error('Persisted note mismatch')
      report.saves.push({ sequence, ms: performance.now() - before })
    } catch (error) { report.failures.push(String(error)) }
    finally { pending = false }
  })())
}, 2000)
try {
  const response = await fetch(base + '/api/comparison', { signal: AbortSignal.timeout(180_000) })
  if (!response.ok) throw new Error(`Comparison HTTP ${response.status}`)
  const comparison = await response.json()
  report.allUnchanged = Object.keys(comparison.tiles).length === 240 && Object.values(comparison.tiles).every((entry: any) => entry.status === 'unchanged' && entry.ratio === 0)
  if (!report.allUnchanged) throw new Error('Real-capture comparison status mismatch')
  report.baselineBytesVerified = 0
  for (const tile of tiles.slice(0, 24)) {
    const image = await fetch(base + comparison.tiles[tile.id].baselineUrl)
    const actual = createHash('sha256').update(new Uint8Array(await image.arrayBuffer())).digest('hex')
    const expected = createHash('sha256').update(readFileSync(join(dir, tile.file))).digest('hex')
    if (!image.ok || actual !== expected) throw new Error('Real-capture baseline bytes mismatch')
    report.baselineBytesVerified++
  }
} catch (error) { report.failures.push(String(error)) }
finally {
  clearInterval(saver); await Promise.all(jobs)
  report.rssBeforeIdleBytes = process.memoryUsage().rss
  report.osRssBeforeIdleBytes = osRssBytes()
  await new Promise(resolve => setTimeout(resolve, 16_000))
  report.rssAfterWorkerIdleBytes = process.memoryUsage().rss
  report.osRssAfterWorkerIdleBytes = osRssBytes()
  Bun.gc(true)
  await new Promise<void>(resolve => setImmediate(resolve))
  report.rssAfterMainCollectionBytes = process.memoryUsage().rss
  report.osRssAfterMainCollectionBytes = osRssBytes()
  clearInterval(sampler)
  report.elapsedMs = performance.now() - start; report.peakSampledRssBytes = peakSampledRssBytes
  writeJson(join(out, 'real-scale-results.json'), report); server.stop()
}
console.log(JSON.stringify({ elapsedMs: report.elapsedMs, peakSampledRssBytes, saves: report.saves.length, failures: report.failures }))
if (report.failures.length) process.exit(1)
