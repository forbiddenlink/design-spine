import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PNG } from 'pngjs'
import { buildComparisonAsync } from '../../src/lib/comparison.ts'
import { startReviewServer } from '../../src/lib/server.ts'
import { compareImages } from '../../src/lib/diff.ts'
import { loadRun, writeJson } from '../../src/lib/runs.ts'

const root = JSON.parse(readFileSync('design-research/field-validation/real-scale-results.json', 'utf8')).root
const dir = join(root, 'runs/current')
const run = loadRun(dir)
const count = Number(process.argv[2] ?? 24)
const serverMode = process.argv[3] === 'server'
run.tiles = run.tiles.slice(0, count)
const hash = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex')
const expected = new Map<string, { baseline: string; diff: string; ratio: number; status: string }>()
const before = performance.now()
for (const tile of run.tiles) {
  const baseline = readFileSync(join(root, 'baselines', tile.file))
  const result = compareImages(PNG.sync.read(baseline), PNG.sync.read(readFileSync(join(dir, tile.file))), 0.002)
  if (!result.diff) throw new Error('Fixture unexpectedly has mismatched dimensions')
  expected.set(tile.id, { baseline: hash(baseline), diff: hash(PNG.sync.write(result.diff)), ratio: result.ratio, status: result.exceeds ? 'changed' : 'unchanged' })
  await new Promise<void>(resolve => setImmediate(resolve))
  Bun.gc(true)
}
const referenceMs = performance.now() - before
console.log('Reference complete', referenceMs)
const started = performance.now()
const server = serverMode ? startReviewServer(dir, 0) : null
const snapshot = server
  ? { report: await (await fetch(`http://localhost:${server.port}/api/comparison`)).json(), images: new Map<string, Uint8Array>() }
  : await buildComparisonAsync(dir, run)
const workerMs = performance.now() - started
for (const tile of run.tiles) {
  const entry = snapshot.report.tiles[tile.id]
  const reference = expected.get(tile.id)!
  if (server) {
    for (const url of [entry.baselineUrl, entry.diffUrl]) {
      const response = await fetch(`http://localhost:${server.port}${url}`)
      if (!response.ok) throw new Error('Evidence request failed: ' + response.status)
      snapshot.images.set(url.replace('/comparison/', ''), new Uint8Array(await response.arrayBuffer()))
    }
  }
  const baseline = snapshot.images.get(entry!.baselineUrl!.replace('/comparison/', ''))
  const diff = snapshot.images.get(entry!.diffUrl!.replace('/comparison/', ''))
  if (entry?.status !== reference.status || entry.ratio !== reference.ratio || !baseline || !diff || hash(baseline) !== reference.baseline || hash(diff) !== reference.diff) throw new Error('Evidence changed: ' + tile.id)
}
writeJson(`design-research/reliability/comparison-decode-${count}${serverMode ? '-server' : ''}.json`, { runtime: Bun.version, serverMode, tiles: run.tiles.length, verifiedEvidenceImages: snapshot.images.size, referenceMs, workerMs, note: 'Sequential reference on main thread vs actual worker; elapsed times are observations, not an isolated speed ratio.', rss: process.memoryUsage().rss })
console.log('Verified', run.tiles.length, 'pairs;', workerMs, 'ms worker')

server?.stop(true)
