import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import pixelmatch from 'pixelmatch'
import { PNG } from 'pngjs'

export function assertScreenshot(
  actual: Buffer,
  baseline: string,
  output: string,
  update = false,
): void {
  if (update) {
    mkdirSync(dirname(baseline), { recursive: true })
    writeFileSync(baseline, actual)
    return
  }
  mkdirSync(output, { recursive: true })
  if (!existsSync(baseline)) {
    writeFileSync(join(output, basename(baseline)), actual)
    throw new Error(
      `Missing visual baseline: ${baseline}. Review and run pnpm test:visual:update explicitly.`,
    )
  }
  const expected = PNG.sync.read(readFileSync(baseline))
  const current = PNG.sync.read(actual)
  const diff = new PNG({ width: current.width, height: current.height })
  const sameSize = expected.width === current.width && expected.height === current.height
  const changed = sameSize
    ? pixelmatch(expected.data, current.data, diff.data, current.width, current.height, {
        threshold: 0.1,
      })
    : -1
  if (changed === 0) return
  writeFileSync(join(output, `actual-${basename(baseline)}`), actual)
  writeFileSync(join(output, `expected-${basename(baseline)}`), readFileSync(baseline))
  if (sameSize) writeFileSync(join(output, `diff-${basename(baseline)}`), PNG.sync.write(diff))
  throw new Error(
    `Visual regression in ${basename(baseline)}: ${sameSize ? `${changed} changed pixels` : 'dimensions changed'}. Evidence: ${output}`,
  )
}
