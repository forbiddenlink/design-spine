import pixelmatch from 'pixelmatch'
import { PNG } from 'pngjs'

export interface DiffResult {
  sizeMismatch: boolean
  diffPixels: number
  ratio: number
  exceeds: boolean
  diff?: PNG
}

/** No resizing: a size mismatch counts as changed. */
export function compareImages(
  base: PNG,
  cur: PNG,
  threshold: number,
  pixelThreshold = 0.1,
): DiffResult {
  if (base.width !== cur.width || base.height !== cur.height) {
    return { sizeMismatch: true, diffPixels: -1, ratio: 1, exceeds: true }
  }
  const diff = new PNG({ width: base.width, height: base.height })
  const diffPixels = pixelmatch(base.data, cur.data, diff.data, base.width, base.height, {
    threshold: pixelThreshold,
  })
  const ratio = diffPixels / (base.width * base.height)
  return { sizeMismatch: false, diffPixels, ratio, exceeds: ratio > threshold, diff }
}
