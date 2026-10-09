import { buildComparisonAsync } from '../../src/lib/comparison.ts'
import { loadRun, writeJson } from '../../src/lib/runs.ts'
const dir = JSON.parse(await Bun.file('design-research/field-validation/real-scale-results.json').text()).root + '/runs/current'
const run = loadRun(dir)
async function releasedResult(): Promise<WeakRef<Map<string, Uint8Array>>> {
 const result = await buildComparisonAsync(dir, { ...run, tiles: run.tiles.slice(0, 1) })
 if (result.images.size !== 2) throw new Error('Missing evidence')
 return new WeakRef(result.images)
}
const reference = await releasedResult()
await new Promise(resolve => setTimeout(resolve, Number(process.argv[3] || 0)))
for (let i = 0; i < 20; i++) { await new Promise(resolve => setTimeout(resolve, 20)); Bun.gc(true) }
const retained = reference.deref() !== undefined
writeJson(`design-research/reliability/queue-retention-${process.argv[2] || 'before'}.json`, { runtime: Bun.version, retained, scope: 'Real worker result map with caller references released; 20 event-loop turns with explicit collection; no RSS or allocator attribution claim.' })
console.log({ retained })
if (retained) process.exit(1)
