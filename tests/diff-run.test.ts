import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PNG } from 'pngjs'
import { afterEach, describe, expect, it } from 'vitest'
import { diffRun } from '../src/lib/diff-run.ts'
import { sha256 } from '../src/lib/hash.ts'

const image = (color: number): Buffer => {
  const png = new PNG({ width: 4, height: 4 })
  png.data.fill(color)
  for (let i = 3; i < png.data.length; i += 4) png.data[i] = 255
  return PNG.sync.write(png)
}

let root = ''
afterEach(() => rmSync(root, { recursive: true, force: true }))

/** A run with one unchanged, one changed and one unbaselined tile. */
function fixture(): string {
  root = mkdtempSync(join(tmpdir(), 'spine-diff-run-'))
  const dir = join(root, '.design-spine/runs/r')
  const baselines = join(root, '.design-spine/baselines')
  mkdirSync(dir, { recursive: true })
  mkdirSync(baselines, { recursive: true })
  for (const [id, current, baseline] of [
    ['same', 10, 10],
    ['changed', 0, 255],
    ['fresh', 30, null],
  ] as const) {
    writeFileSync(join(dir, `${id}.png`), image(current))
    if (baseline !== null) writeFileSync(join(baselines, `${id}.png`), image(baseline))
  }
  writeFileSync(
    join(dir, 'run.json'),
    JSON.stringify({
      id: 'r',
      tiles: ['same', 'changed', 'fresh'].map((id) => ({ id, file: `${id}.png` })),
    }),
  )
  return dir
}

describe('diffRun', () => {
  it('classifies each tile and writes a diff image only for the changed one', async () => {
    const dir = fixture()
    const result = await diffRun({ root, dir, threshold: 0.002, pixelThreshold: 0.1 })
    expect(result.rows.map((r) => [r.id, r.result])).toEqual([
      ['same', 'ok'],
      ['changed', 'CHANGED'],
      ['fresh', 'new'],
    ])
    expect(result.failedComparisons).toBe(1)
    expect(result.policy).toBe('pixels')
    expect(result.gateReasons).toEqual([])
    expect(existsSync(join(dir, 'diff/changed.png'))).toBe(true)
    expect(existsSync(join(dir, 'diff/same.png'))).toBe(false)
  })

  it('counts a missing baseline as a failure only with requireBaselines', async () => {
    const dir = fixture()
    const result = await diffRun({
      root,
      dir,
      threshold: 0.002,
      pixelThreshold: 0.1,
      requireBaselines: true,
    })
    expect(result.failedComparisons).toBe(2)
    expect(result.policy).toBe('require-baselines')
  })

  it('reports strict gate reasons without counting them as failed comparisons', async () => {
    const dir = fixture()
    const result = await diffRun({ root, dir, threshold: 0.002, pixelThreshold: 0.1, strict: true })
    expect(result.policy).toBe('strict')
    expect(result.gateReasons.length).toBeGreaterThan(0)
    // Tiles without a recorded imageHash fail strict as modified captures.
    expect(result.rows.every((r) => r.result === 'modified-capture')).toBe(true)
    expect(result.failedComparisons).toBe(3)
  })
})

describe('orphan baselines', () => {
  const withManifest = (): string => {
    const dir = fixture()
    writeFileSync(
      join(root, '.design-spine/baselines/manifest.json'),
      JSON.stringify({ tiles: { same: {}, changed: {}, removed: { file: 'removed.png' } } }),
    )
    return dir
  }
  it('lists baselines with no screen in the run without failing a pixel diff', async () => {
    const dir = withManifest()
    const result = await diffRun({
      root,
      dir,
      threshold: 0.002,
      pixelThreshold: 0.1,
    })
    expect(result.orphans).toEqual(['removed'])
    expect(result.gateReasons).toEqual([])
    expect(result.failedComparisons).toBe(1)
  })
  it('fails strict on a baseline whose screen is gone', async () => {
    const dir = withManifest()
    const result = await diffRun({
      root,
      dir,
      threshold: 0.002,
      pixelThreshold: 0.1,
      strict: true,
    })
    expect(result.gateReasons).toContain(
      'removed: approved baseline has no screen in this run; remove it from the baselines or restore the route or state',
    )
  })
})

describe('largest changed region cap', () => {
  /** A tall page where one 40x40 block changed: 1,600 px, about 0.13% of the page. */
  const tall = (changed: boolean): Buffer => {
    const png = new PNG({ width: 400, height: 3000 })
    png.data.fill(255)
    if (changed)
      for (let y = 100; y < 140; y++)
        for (let x = 100; x < 140; x++) png.data.fill(0, (y * 400 + x) * 4, (y * 400 + x) * 4 + 3)
    return PNG.sync.write(png)
  }
  const setup = (): string => {
    const dir = fixture()
    writeFileSync(join(dir, 'same.png'), tall(true))
    writeFileSync(join(root, '.design-spine/baselines/same.png'), tall(false))
    return dir
  }
  it('passes a small block under the page ratio without a cap', async () => {
    const dir = setup()
    const result = await diffRun({ root, dir, threshold: 0.002, pixelThreshold: 0.1 })
    expect(result.rows.find((r) => r.id === 'same')?.result).toBe('ok')
  })
  it('fails the same block when it is larger than --max-region', async () => {
    const dir = setup()
    const result = await diffRun({
      root,
      dir,
      threshold: 0.002,
      pixelThreshold: 0.1,
      maxRegionPixels: 500,
    })
    expect(result.rows.find((r) => r.id === 'same')?.result).toBe('CHANGED')
  })
})

describe('strict structure snapshots', () => {
  /** One pixel-identical tile whose run and baseline both recorded the same accessibility snapshot. */
  const setup = (): string => {
    root = mkdtempSync(join(tmpdir(), 'spine-diff-aria-'))
    const dir = join(root, '.design-spine/runs/r')
    const baselines = join(root, '.design-spine/baselines')
    mkdirSync(dir, { recursive: true })
    mkdirSync(baselines, { recursive: true })
    const png = image(10)
    const aria = '- button "Save"\n'
    for (const d of [dir, baselines]) {
      writeFileSync(join(d, 'home.png'), png)
      writeFileSync(join(d, 'home.aria.yml'), aria)
    }
    const imageHash = sha256(png)
    const ariaHash = sha256(Buffer.from(aria))
    writeFileSync(
      join(dir, 'run.json'),
      JSON.stringify({ id: 'r', tiles: [{ id: 'home', file: 'home.png', imageHash, ariaHash }] }),
    )
    writeFileSync(
      join(baselines, 'manifest.json'),
      JSON.stringify({ tiles: { home: { file: 'home.png', imageHash, ariaHash } } }),
    )
    return dir
  }
  const strictRow = async (dir: string): Promise<string | undefined> =>
    (await diffRun({ root, dir, threshold: 0.002, pixelThreshold: 0.1, strict: true })).rows[0]
      ?.result
  it('passes when both snapshots are present and identical', async () => {
    expect(await strictRow(setup())).toBe('ok')
  })
  it('fails when the approved baseline snapshot is missing', async () => {
    const dir = setup()
    rmSync(join(root, '.design-spine/baselines/home.aria.yml'))
    expect(await strictRow(dir)).toBe('modified-baseline')
  })
  it('fails when the approved baseline snapshot was edited', async () => {
    const dir = setup()
    writeFileSync(join(root, '.design-spine/baselines/home.aria.yml'), '- button "Delete"\n')
    expect(await strictRow(dir)).toBe('modified-baseline')
  })
  it('fails when the captured snapshot is missing', async () => {
    const dir = setup()
    rmSync(join(dir, 'home.aria.yml'))
    expect(await strictRow(dir)).toBe('modified-capture')
  })

  it('adds the diff image and the box of changed pixels to a changed row only', async () => {
    const dir = fixture()
    const { rows } = await diffRun({ root, dir, threshold: 0.002, pixelThreshold: 0.1 })
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]))
    expect(byId.changed?.box).toEqual({ x: 0, y: 0, w: 4, h: 4 })
    expect(byId.changed?.diffImage).toBe(join(dir, 'diff', 'changed.png'))
    expect(byId.same?.box).toBeUndefined()
    expect(byId.same?.diffImage).toBeUndefined()
    expect(byId.fresh?.box).toBeUndefined()
  })
})
