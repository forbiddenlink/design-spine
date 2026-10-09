import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PNG } from 'pngjs'
import { compareImages } from '../../src/lib/diff.ts'
import { loadRun, writeJson } from '../../src/lib/runs.ts'

// Read only the previously isolated Liz-owned public-page fixture.
const root = JSON.parse(readFileSync('design-research/field-validation/real-scale-results.json', 'utf8')).root
const dir = join(root, 'runs/current')
const run = loadRun(dir)
const rows: object[] = []
const options = [{ name: 'default', value: {} }, { name: 'level-1', value: { deflateLevel: 1 } }, { name: 'filter-none', value: { filterType: 0 } }, { name: 'level-1-filter-none', value: { deflateLevel: 1, filterType: 0 } }]
for (let round = 0; round < 1; round++) {
  for (const option of options) {
    let readMs = 0, compareMs = 0, writeMs = 0, bytes = 0
    const started = performance.now()
    for (const tile of run.tiles.slice(0, 3)) {
      let start = performance.now()
      const base = PNG.sync.read(readFileSync(join(root, 'baselines', tile.file)))
      const current = PNG.sync.read(readFileSync(join(dir, tile.file)))
      readMs += performance.now() - start
      start = performance.now()
      const result = compareImages(base, current, 0.002)
      compareMs += performance.now() - start
      if (!result.diff || result.ratio !== 0) throw new Error('Unexpected fixture comparison')
      start = performance.now()
      const encoded = PNG.sync.write(result.diff, option.value)
      writeMs += performance.now() - start
      const decoded = PNG.sync.read(encoded)
      if (!decoded.data.equals(result.diff.data)) throw new Error('Pixel evidence changed')
      bytes += encoded.byteLength
      console.log('tile', tile.id, { readMs, compareMs, writeMs })
      Bun.gc(true)
    }
    const row = { round, option: option.name, tiles: 3, readMs, compareMs, writeMs, bytes, totalMs: performance.now() - started, rss: process.memoryUsage().rss }
    rows.push(row)
    console.log(JSON.stringify(row))
    writeJson('design-research/reliability/comparison-performance.json', { runtime: Bun.version, rows })
  }
}
