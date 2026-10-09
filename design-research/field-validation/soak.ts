import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { PNG } from 'pngjs'
import { startReviewServer } from '../../src/lib/server.ts'
import { writeJson } from '../../src/lib/runs.ts'

const out = 'design-research/field-validation'
mkdirSync(join(out, '.design-spine/runs'), { recursive: true })
const root = mkdtempSync(join(process.cwd(), out, '.design-spine/runs/soak-'))
const dir = join(root, 'runs/current'), baselines = join(root, 'baselines')
mkdirSync(dir, { recursive: true }); mkdirSync(baselines)
const source = JSON.parse(readFileSync('design-research/.design-spine/runs/2026-10-08T15-32-24-858Z/run.json', 'utf8'))
const dimensions = [[390, 1800], [1280, 2400], [2048, 6144]]
const variants = dimensions.map(([width, height]) => {
  const png = new PNG({ width, height })
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4
    png.data[i] = 64 + x % 128; png.data[i + 1] = 64 + y % 128
    png.data[i + 2] = 180; png.data[i + 3] = 255
  }
  const baseline = PNG.sync.write(png)
  for (let y = 40; y < 140; y++) for (let x = 40; x < 240; x++) png.data[(y * width + x) * 4] = 0
  return { baseline, current: PNG.sync.write(png) }
})
const tiles = Array.from({ length: 240 }, (_, i) => {
  const variant = i < 180 ? 0 : i < 228 ? 1 : 2
  const file = `soak-${i}.png`
  writeFileSync(join(dir, file), variants[variant].current)
  writeFileSync(join(baselines, file), variants[variant].baseline)
  return { ...source.tiles[0], id: `soak-${i}`, file, route: `/soak/${i}`, viewport: dimensions[variant][0], blankRegions: { count: 0, boxes: [] } }
})
writeJson(join(dir, 'run.json'), { ...source, id: 'isolated-soak', tiles })
writeJson(join(dir, 'review.json'), { tiles: {} })
const server = startReviewServer(dir, 0), base = `http://localhost:${server.port}`
const start = performance.now(), durationMs = Number(process.argv[2] ?? 1200) * 1000
const report: any = { root, dimensions, distribution: [180, 48, 12], requestedDurationMs: durationMs, samples: [], comparisons: [], saves: [], failures: [], scope: 'Local generated long PNGs; 100ms sampled RSS includes worker in this process, not an exact allocation peak. No production percentile or physical-device claim.' }
let expected = performance.now() + 100, maxLagMs = 0, peakRssBytes = 0, active = false, sequence = 0
let canonical: string | undefined
const jobs = new Set<Promise<void>>()
function checkpoint(): void {
  report.elapsedMs = performance.now() - start; report.peakSampledRssBytes = peakRssBytes; report.maxEventLoopLagMs = maxLagMs
  writeJson(join(out, 'soak-progress.json'), report)
}
const sampler = setInterval(() => {
  const now = performance.now(), rss = process.memoryUsage().rss
  maxLagMs = Math.max(maxLagMs, now - expected); expected = now + 100
  peakRssBytes = Math.max(peakRssBytes, rss)
  if (rss > 2.5 * 1024 ** 3) {
    report.failures.push({ kind: 'memory-stop', rss, elapsedMs: now - start }); checkpoint()
    writeJson(join(out, 'soak-results.json'), report); console.error('Memory ceiling exceeded; stopping the test process'); process.exit(3)
  }
}, 100)
const foreground = setInterval(() => {
  if (active) return
  active = true
  const job = (async () => {
    const note = `isolated-soak-${++sequence}`, before = performance.now()
    try {
      const response = await fetch(base + '/api/review', { method: 'POST', body: JSON.stringify({ tileId: tiles[0].id, note }), signal: AbortSignal.timeout(10_000) })
      const saved = await response.json()
      if (!response.ok || saved.note !== note) throw new Error('Save response mismatch')
      const loaded = await (await fetch(base + '/api/run?compare=false', { signal: AbortSignal.timeout(10_000) })).json()
      if (loaded.review.tiles[tiles[0].id].note !== note) throw new Error('Read-after-save mismatch')
      report.saves.push({ sequence, elapsedMs: performance.now() - start, roundtripMs: performance.now() - before })
    } catch (error) { report.failures.push({ kind: 'foreground', message: String(error) }) }
    finally { active = false }
  })()
  jobs.add(job); void job.finally(() => jobs.delete(job))
}, 2000)
const progress = setInterval(checkpoint, 10_000)
console.log(JSON.stringify({ base, root, durationMs, tiles: tiles.length }))
try {
  while (performance.now() - start < durationMs && !report.failures.length) {
    const before = performance.now()
    const response = await fetch(base + '/api/comparison', { signal: AbortSignal.timeout(180_000) })
    if (!response.ok) throw new Error(`Comparison HTTP ${response.status}`)
    const data = await response.json()
    if (Object.keys(data.tiles).length !== 240 || !Object.values(data.tiles).every((t: any) => typeof t.ratio === 'number' && t.status === (t.ratio > data.threshold ? 'changed' : 'unchanged'))) throw new Error('Comparison status/count mismatch')
    const digest: unknown[] = []
    for (const i of [0, 179, 180, 227, 228, 239]) {
      const tile = data.tiles[tiles[i].id], hashes: string[] = []
      for (const url of [tile.baselineUrl, tile.diffUrl]) {
        const image = await fetch(base + url)
        if (!image.ok) throw new Error('Snapshot evidence unavailable')
        hashes.push(createHash('sha256').update(new Uint8Array(await image.arrayBuffer())).digest('hex'))
      }
      digest.push({ id: tiles[i].id, ratio: tile.ratio, hashes })
    }
    const hash = JSON.stringify(digest)
    if (canonical && canonical !== hash) throw new Error('Repeated comparison evidence changed')
    canonical = hash
    report.comparisons.push({ elapsedMs: performance.now() - start, totalMs: performance.now() - before, rssBytes: process.memoryUsage().rss, digest })
    checkpoint()
    console.log(`Comparison ${report.comparisons.length}; ${Math.round((performance.now() - start) / 1000)}s; saves ${report.saves.length}; sampled RSS ${Math.round(peakRssBytes / 1024 ** 2)}MB`)
  }
} catch (error) { report.failures.push({ kind: 'comparison', message: String(error) }) }
finally {
  clearInterval(foreground); await Promise.all(jobs)
  clearInterval(sampler); clearInterval(progress)
  report.finalRssBytes = process.memoryUsage().rss; checkpoint()
  writeJson(join(out, 'soak-results.json'), report)
  server.stop()
}
if (report.failures.length) throw new Error(JSON.stringify(report.failures))
console.log(`Soak complete: ${report.comparisons.length} comparisons, ${report.saves.length} verified saves`)
