import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildComparison } from '../src/lib/comparison.ts'
const sourceDir = 'design-research/.design-spine/runs/2026-10-08T15-32-24-858Z'
const source = JSON.parse(readFileSync(join(sourceDir, 'run.json'), 'utf8'))
const root = 'design-research/.design-spine/runs/comparison-scale-sandbox'
const dir = join(root, 'runs', 'measurement'); const baselines = join(root, 'baselines')
mkdirSync(dir, { recursive: true }); mkdirSync(baselines, { recursive: true })
const results = []
for (const count of [10, 50, 100]) {
 const tiles = Array.from({ length: count }, (_, index) => ({ ...source.tiles[0], id: 'measure-' + index, file: 'measure-' + index + '.png' }))
 for (const tile of tiles) { copyFileSync(join(sourceDir, source.tiles[0].file), join(dir, tile.file)); copyFileSync(join(sourceDir, source.tiles[0].file), join(baselines, tile.file)) }
 const start = performance.now(); const comparison = buildComparison(dir, { ...source, tiles }); const duration = performance.now() - start
 results.push({ count, milliseconds: duration, imageEvidenceEntries: comparison.images.size, totalEncodedEvidenceBytes: [...comparison.images.values()].reduce((total, image) => total + image.byteLength, 0), fixture: 'Unique files cloned from the existing generated 390px PNG; identical baselines' })
}
writeFileSync('design-research/comparison-scale-measurement.json', JSON.stringify(results, null, 2)); console.log(JSON.stringify(results, null, 2))
