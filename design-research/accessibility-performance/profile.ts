import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { PNG } from 'pngjs'
import { writeJson } from '../../src/lib/runs.ts'

const label = process.argv[2] || 'before'
const root = 'design-research/accessibility-performance/evidence/.design-spine/runs/profile'
const dir = join(root, 'runs/current'); const baselines = join(root, 'baselines')
mkdirSync(dir, { recursive: true }); mkdirSync(baselines, { recursive: true })
let moduleUrl = new URL('../../src/lib/server.ts', import.meta.url).href
if (label === 'before') {
  function historical(file: string): string { const result = spawnSync('git', ['show', `911c6b6:${file}`], { encoding: 'utf8' }); if (result.status !== 0) throw new Error(result.stderr); return result.stdout }
  const lib = join(process.cwd(), 'src/lib')
  const comparisonFile = join(process.cwd(), root, 'comparison-before.ts')
  writeFileSync(comparisonFile, historical('src/lib/comparison.ts').replace("'./diff.ts'", JSON.stringify(join(lib, 'diff.ts'))).replace("'./runs.ts'", JSON.stringify(join(lib, 'runs.ts'))).replace("'./types.ts'", JSON.stringify(join(lib, 'types.ts'))))
  const serverFile = join(process.cwd(), root, 'server-before.ts')
  writeFileSync(serverFile, historical('src/lib/server.ts').replace("'./comparison.ts'", JSON.stringify(comparisonFile)).replace("'./review.ts'", JSON.stringify(join(lib, 'review.ts'))).replace("'./runs.ts'", JSON.stringify(join(lib, 'runs.ts'))).replace("'./types.ts'", JSON.stringify(join(lib, 'types.ts'))).replace("new URL('../ui/index.html', import.meta.url)", JSON.stringify(join(process.cwd(), 'src/ui/index.html'))).replace('    port,', '    port,\n    idleTimeout: 120,'))
  moduleUrl = new URL('file://' + serverFile).href
}
const { startReviewServer } = await import(moduleUrl)
const source = JSON.parse(readFileSync('design-research/.design-spine/runs/2026-10-08T15-32-24-858Z/run.json', 'utf8'))
const dimensions = [[390, 844], [1280, 2400], [2048, 6144]]
const tiles = Array.from({ length: 12 }, (_, i) => ({ ...source.tiles[0], id: `profile-${i}`, file: `profile-${i}.png`, route: `/profile-${i}`, blankRegions: undefined }))
for (let i = 0; i < 3; i++) {
  const [width, height] = dimensions[i]; const png = new PNG({ width, height })
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const o = (y * width + x) * 4; png.data[o] = (x % 128) + 64; png.data[o+1] = (y % 128) + 64; png.data[o+2] = 180; png.data[o+3] = 255
  }
  const baseline = PNG.sync.write(png)
  for (let y = 40; y < 140; y++) for (let x = 40; x < 240; x++) png.data[(y * width + x) * 4] = 0
  const current = PNG.sync.write(png)
  for (let j = i; j < 12; j += 3) { writeFileSync(join(dir, tiles[j].file), current); writeFileSync(join(baselines, tiles[j].file), baseline) }
}
writeJson(join(dir, 'run.json'), { ...source, tiles }); writeJson(join(dir, 'review.json'), { tiles: {} })
const server = startReviewServer(dir, 0); const base = `http://localhost:${server.port}`
const samples: unknown[] = []; let canonical: unknown
try {
  for (let trial = 0; trial < 4; trial++) {
    const lags: number[] = []; const saves: number[] = []; let expected = performance.now() + 25; const jobs: Promise<void>[] = []
    const timer = setInterval(() => {
      const now = performance.now(); lags.push(Math.max(0, now - expected)); expected = now + 25
      const start = performance.now()
      if (jobs.length < 8) jobs.push(fetch(base + '/api/review', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tileId: 'profile-0', note: `trial-${trial}` }) }).then(async r => { if (!r.ok) throw new Error('Save failed'); await r.text(); saves.push(performance.now() - start) }))
    }, 25)
    const start = performance.now(); const response = await fetch(base + '/api/comparison'); const report = await response.json(); const totalMs = performance.now() - start
    clearInterval(timer); await Promise.all(jobs)
    const digest = []
    for (const [id, value] of Object.entries(report.tiles) as [string, any][]) {
      const hashes: string[] = []
      for (const url of [value.baselineUrl, value.diffUrl]) { const r = await fetch(base + url); if (!r.ok) throw new Error('Missing immutable evidence'); hashes.push(createHash('sha256').update(new Uint8Array(await r.arrayBuffer())).digest('hex')) }
      digest.push({ id, status: value.status, ratio: value.ratio, hashes })
    }
    canonical = digest
    if (trial) samples.push({ trial, totalMs, maxEventLoopLagMs: Math.max(...lags), maxSaveMs: Math.max(...saves), saveCount: saves.length, rssBytes: process.memoryUsage().rss })
    console.log(label, trial, { totalMs, maxLag: Math.max(...lags), maxSave: Math.max(...saves), saves: saves.length })
  }
  writeJson(`design-research/accessibility-performance/evidence/profile-${label}.json`, { runtime: Bun.version, dimensions, tiles: tiles.length, warmups: 1, samples, canonical, scope: 'Generated patterned PNGs, identical 12 pairs and eight saves per trial, sequential trials on this Mac; before source is commit 911c6b6. RSS is end-of-trial process memory, not peak or a leak diagnosis.' })
} finally { server.stop() }
