import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PNG } from 'pngjs'
import { afterEach, describe, expect, it } from 'vitest'
import { diffRun } from '../src/lib/diff-run.ts'

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
