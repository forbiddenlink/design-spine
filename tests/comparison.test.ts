import { spawnSync } from 'node:child_process'
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
function image(path: string, width = 4, color = 255, height = 4): void {
  const png = new PNG({ width, height })
  png.data.fill(color)
  for (let i = 3; i < png.data.length; i += 4) png.data[i] = 255
  writeFileSync(path, PNG.sync.write(png))
}
describe('read-only comparisons', () => {
  it('releases completed evidence after its caller lets go', () => {
    const f = fixture()
    image(join(f.dir, 'home.png'))
    image(join(f.baselines, 'home.png'))
    const moduleUrl = new URL('../src/lib/comparison.ts', import.meta.url).href
    const result = spawnSync(
      'bun',
      [
        '-e',
        `
      import { buildComparisonAsync } from ${JSON.stringify(moduleUrl)};
      async function inspect() {
        const snapshot = await buildComparisonAsync(${JSON.stringify(f.dir)}, ${JSON.stringify(f.run)});
        if (snapshot.images.size !== 2) throw new Error('Missing evidence');
        return new WeakRef(snapshot.images);
      }
      const reference = await inspect();
      for (let i = 0; i < 20; i++) {
        await new Promise(resolve => setTimeout(resolve, 20));
        Bun.gc(true);
      }
      if (reference.deref()) throw new Error('Queue retains released evidence');
    `,
      ],
      { encoding: 'utf8', timeout: 10_000 },
    )
    expect(result.status, result.stderr || result.stdout).toBe(0)
  })
  it('preserves all evidence across multiple worker collection batches', async () => {
    const f = fixture()
    image(join(f.dir, 'home.png'), 4, 0)
    image(join(f.baselines, 'home.png'))
    f.run.tiles = Array.from({ length: 12 }, (_, index) => ({
      ...f.tile,
      id: `batch-${index}`,
      ...(index === 5 ? { file: 'missing.png' } : {}),
      ...(index === 9 ? { error: 'Generated capture failure' } : {}),
    }))
    const expected = buildComparison(f.dir, f.run)
    const actual = await buildComparisonAsync(f.dir, f.run)
    for (const tile of f.run.tiles) {
      const reference = expected.report.tiles[tile.id]
      const entry = actual.report.tiles[tile.id]
      expect(entry?.status).toBe(reference?.status)
      expect(entry?.ratio).toBe(reference?.ratio)
    }
    expect([...actual.images.values()].map((bytes) => Buffer.from(bytes))).toEqual(
      [...expected.images.values()].map((bytes) => Buffer.from(bytes)),
    )
  })
  it('keeps the event loop responsive during non-trivial off-thread comparisons', async () => {
    const f = fixture()
    image(join(f.dir, 'home.png'), 256, 255, 256)
    image(join(f.baselines, 'home.png'), 256, 255, 256)
    f.run.tiles = Array.from({ length: 8 }, (_, index) => ({
      ...f.tile,
      id: `responsive-${index}`,
    }))
    let yielded = false
    const pending = buildComparisonAsync(f.dir, f.run)
    setTimeout(() => {
      yielded = true
    }, 0)
    const result = await pending
    expect(yielded).toBe(true)
    expect(Object.values(result.report.tiles).every((tile) => tile.status === 'unchanged')).toBe(
      true,
    )
  })
  it('recovers from failed jobs and continues queued comparisons with isolated snapshots', async () => {
    const f = fixture()
    image(join(f.dir, 'home.png'))
    image(join(f.baselines, 'home.png'))
    const failed = expect(buildComparisonAsync(join(f.dir, 'missing'), f.run)).rejects.toThrow()
    const first = buildComparisonAsync(f.dir, f.run)
    const second = buildComparisonAsync(f.dir, f.run)
    await failed
    const [a, b] = await Promise.all([first, second])
    expect(a.report.tiles.home?.status).toBe('unchanged')
    expect(b.report.tiles.home?.status).toBe('unchanged')
    expect(a.report.tiles.home?.baselineUrl).not.toBe(b.report.tiles.home?.baselineUrl)
    expect([...a.images.values()]).toEqual([...b.images.values()])
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
