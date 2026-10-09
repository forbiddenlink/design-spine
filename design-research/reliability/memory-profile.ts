import { heapStats } from 'bun:jsc'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { startReviewServer } from '../../src/lib/server.ts'
import { buildComparisonAsync } from '../../src/lib/comparison.ts'
import { writeJson, loadRun } from '../../src/lib/runs.ts'

const mode = process.argv[2] || 'server'
const dir = JSON.parse(readFileSync('design-research/field-validation/real-scale-results.json', 'utf8')).root + '/runs/current'
const run = loadRun(dir)
const rows: unknown[] = []
let peakRss = 0
function checkpoint(label: string, extra: object = {}): void {
 Bun.gc(true)
 const heap = heapStats() as ReturnType<typeof heapStats> & { mimalloc?: any }
 const mem = process.memoryUsage()
 const os = Bun.spawnSync(['ps', '-o', 'rss=', '-p', String(process.pid)])
 const row = { label, ...extra, memory: mem, osRss: Number(os.stdout.toString().trim()) * 1024, heap: { heapSize: heap.heapSize, heapCapacity: heap.heapCapacity, extraMemorySize: heap.extraMemorySize, arrayBuffers: heap.objectTypeCounts.ArrayBuffer, promises: heap.objectTypeCounts.Promise }, native: heap.mimalloc ? { process: heap.mimalloc.process, committed: heap.mimalloc.committed, mallocHuge: heap.mimalloc.malloc_huge, pagesAbandoned: heap.mimalloc.pages_abandoned, threads: heap.mimalloc.threads, purged: heap.mimalloc.purged, purgeCalls: heap.mimalloc.purge_calls } : null }
 rows.push(row); console.log(label, Math.round(mem.rss / 1024 ** 2), 'MiB', 'JS+', Math.round(heap.extraMemorySize / 1024 ** 2), 'MiB')
 writeJson(`design-research/reliability/memory-${mode}.json`, { runtime: Bun.version, mode, dir, tiles: run.tiles.length, peakRss, rows })
}
const sampler = setInterval(() => { peakRss = Math.max(peakRss, process.memoryUsage().rss); if (peakRss > 2.5 * 1024 ** 3) { checkpoint('ceiling'); process.exit(3) } }, 100)
const server = mode === 'server' ? startReviewServer(dir, 0) : null
try {
 checkpoint('start')
 for (let i = 0; i < 2; i++) {
  const started = performance.now()
  if (server) {
   const response = await fetch(`http://localhost:${server.port}/api/comparison`)
   const report = await response.json()
   if (!response.ok || Object.keys(report.tiles).length !== 240 || !Object.values(report.tiles).every((t: any) => t.status === 'unchanged' && t.ratio === 0)) throw new Error('Unexpected comparison')
   checkpoint('comparison-' + i, { ms: performance.now() - started })
  } else {
   const snapshot = await buildComparisonAsync(dir, run)
   if (Object.keys(snapshot.report.tiles).length !== 240) throw new Error('Incomplete comparison')
   const bytes = [...snapshot.images.values()].reduce((sum, image) => sum + image.byteLength, 0)
   checkpoint('comparison-' + i, { ms: performance.now() - started, retainedSnapshotBytes: bytes })
  }
 }
 await new Promise(resolve => setTimeout(resolve, 17_000)); checkpoint('after-worker-idle')
 if (!server) { await buildComparisonAsync(dir, { ...run, tiles: [] }); await new Promise(resolve => setTimeout(resolve, 17_000)); checkpoint('after-empty-replaces-queue-result') }
} finally { server?.stop(true); clearInterval(sampler); checkpoint('end') }
