import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PNG } from 'pngjs'
import { expect, it } from 'vitest'
import { assertScreenshot } from './helpers/visual.ts'

it('fails closed on missing and changed screenshots and updates only explicitly', () => {
  const root = mkdtempSync(join(tmpdir(), 'spine-visual-'))
  try {
    const baseline = join(root, 'baseline.png')
    const output = join(root, 'results')
    const png = new PNG({ width: 20, height: 20 })
    png.data.fill(255)
    const original = PNG.sync.write(png)
    expect(() => assertScreenshot(original, baseline, output)).toThrow('Missing visual baseline')
    expect(existsSync(baseline)).toBe(false)
    assertScreenshot(original, baseline, output, true)
    expect(() => assertScreenshot(original, baseline, output)).not.toThrow()
    png.data.fill(0)
    const changed = PNG.sync.write(png)
    expect(() => assertScreenshot(changed, baseline, output)).toThrow('Visual regression')
    expect(existsSync(join(output, 'diff-baseline.png'))).toBe(true)
    expect(readFileSync(baseline)).toEqual(original)
    const resized = PNG.sync.write(new PNG({ width: 21, height: 20 }))
    expect(() => assertScreenshot(resized, baseline, output)).toThrow('dimensions changed')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
