import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PNG } from 'pngjs'
import { describe, expect, it } from 'vitest'
import { buildComparison, buildComparisonAsync } from '../src/lib/comparison.ts'
import type { RunRecord, Tile } from '../src/lib/types.ts'

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'spine-comparison-'))
  const dir = join(root, 'runs', 'test')
  const baselines = join(root, 'baselines')
  mkdirSync(dir, { recursive: true })
  mkdirSync(baselines)
  const tile = { id: 'home', file: 'home.png' } as Tile
  const run = { tiles: [tile] } as RunRecord
  return { root, dir, baselines, tile, run }
}
function image(path: string, width = 4, color = 255): void {
  const png = new PNG({ width, height: 4 })
  png.data.fill(color)
  for (let i = 3; i < png.data.length; i += 4) png.data[i] = 255
  writeFileSync(path, PNG.sync.write(png))
}
describe('read-only comparisons', () => {
  it('yields between comparisons while retaining the same evidence statuses', async () => {
    const f = fixture()
    image(join(f.dir, 'home.png'))
    image(join(f.baselines, 'home.png'))
    f.run.tiles.push({ ...f.tile, id: 'second' })
    let yielded = false
    const pending = buildComparisonAsync(f.dir, f.run)
    setTimeout(() => {
      yielded = true
    }, 0)
    const result = await pending
    expect(yielded).toBe(true)
    expect(result.report.tiles.home?.status).toBe('unchanged')
    expect(result.report.tiles.second?.status).toBe('unchanged')
  })
  it('distinguishes missing captures from captures without baselines', () => {
    const f = fixture()
    expect(buildComparison(f.dir, f.run).report.tiles.home?.status).toBe('no-capture')
    image(join(f.dir, 'home.png'))
    expect(buildComparison(f.dir, f.run).report.tiles.home?.status).toBe('new')
  })
  it('compares fresh pixels and exposes baseline provenance without trusting old rows', () => {
    const f = fixture()
    image(join(f.dir, 'home.png'))
    image(join(f.baselines, 'home.png'))
    writeFileSync(
      join(f.dir, 'diff.json'),
      JSON.stringify({ threshold: 0.1, rows: [{ id: 'home', result: 'CHANGED' }] }),
    )
    writeFileSync(
      join(f.baselines, 'manifest.json'),
      JSON.stringify({ tiles: { home: { run: 'previous', approvedAt: '2026-10-08' } } }),
    )
    const before = buildComparison(f.dir, f.run)
    expect(before.report.tiles.home).toMatchObject({
      status: 'unchanged',
      ratio: 0,
      baselineRun: 'previous',
    })
    image(join(f.baselines, 'home.png'), 4, 0)
    expect(buildComparison(f.dir, f.run).report.tiles.home?.status).toBe('changed')
    expect(before.images.size).toBe(2)
  })
  it('does not resize mismatched captures or offer a misleading pixel difference', () => {
    const f = fixture()
    image(join(f.dir, 'home.png'), 8)
    image(join(f.baselines, 'home.png'))
    const entry = buildComparison(f.dir, f.run).report.tiles.home
    expect(entry?.status).toBe('size-changed')
    expect(entry?.diffUrl).toBeUndefined()
  })
  it('isolates corrupt images and ignores invalid threshold values', () => {
    const f = fixture()
    image(join(f.dir, 'home.png'))
    writeFileSync(join(f.baselines, 'home.png'), 'invalid')
    writeFileSync(join(f.dir, 'diff.json'), '{"threshold":-1}')
    const result = buildComparison(f.dir, f.run)
    expect(result.report.threshold).toBe(0.002)
    expect(result.report.tiles.home?.status).toBe('unavailable')
  })
  it('rejects traversal and symlinks escaping baseline storage', () => {
    const f = fixture()
    image(join(f.dir, 'home.png'))
    image(join(f.root, 'outside.png'))
    symlinkSync(join(f.root, 'outside.png'), join(f.baselines, 'home.png'))
    expect(buildComparison(f.dir, f.run).report.tiles.home?.status).toBe('new')
    f.tile.file = '../../outside.png'
    expect(buildComparison(f.dir, f.run).report.tiles.home?.status).toBe('no-capture')
  })
})
