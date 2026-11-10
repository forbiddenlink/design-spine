import pixelmatch from 'pixelmatch'
import { PNG } from 'pngjs'
import type { Box } from './types.ts'

export interface DiffResult {
  sizeMismatch: boolean
  diffPixels: number
  ratio: number
  exceeds: boolean
  diff?: PNG
  regions?: Box[]
  /** Pixels whose RGBA bytes differ at all, after masks. Ignores pixelmatch's perceptual threshold. */
  exactDiffPixels?: number
  /** exactDiffPixels over the image area. */
  exactRatio?: number
  /**
   * Within the perceptual threshold, yet more than `threshold` of the pixels changed exactly:
   * a low-contrast change such as a token color shift that pixelmatch's YIQ tolerance hides.
   */
  subtle?: boolean
}

/** Count pixels whose RGBA bytes differ. Both buffers have the same length. */
function countExact(a: Uint8Array, b: Uint8Array): number {
  let n = 0
  for (let i = 0; i < a.length; i += 4)
    if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2] || a[i + 3] !== b[i + 3])
      n++
  return n
}

/** No resizing: a size mismatch counts as changed. */
export function compareImages(
  base: PNG,
  cur: PNG,
  threshold: number,
  pixelThreshold = 0.1,
  ignored: Box[] = [],
  withRegions = true,
): DiffResult {
  if (base.width !== cur.width || base.height !== cur.height) {
    return { sizeMismatch: true, diffPixels: -1, ratio: 1, exceeds: true }
  }
  const diff = new PNG({ width: base.width, height: base.height })
  const baseData = ignored.length ? Buffer.from(base.data) : base.data
  const currentData = ignored.length ? Buffer.from(cur.data) : cur.data
  for (const box of ignored) {
    if (![box.x, box.y, box.w, box.h].every(Number.isFinite) || box.w <= 0 || box.h <= 0) continue
    for (
      let y = Math.max(0, Math.floor(box.y));
      y < Math.min(base.height, Math.ceil(box.y + box.h));
      y++
    ) {
      const start = (y * base.width + Math.max(0, Math.floor(box.x))) * 4
      const end = (y * base.width + Math.min(base.width, Math.ceil(box.x + box.w))) * 4
      if (end > start) {
        baseData.fill(0, start, end)
        currentData.fill(0, start, end)
      }
    }
  }
  const diffPixels = pixelmatch(baseData, currentData, diff.data, base.width, base.height, {
    threshold: pixelThreshold,
  })
  const total = base.width * base.height
  const ratio = diffPixels / total
  const exceeds = ratio > threshold
  // Only count exactly when pixelmatch stayed under the threshold; above it the answer is already "changed".
  const exactDiffPixels = exceeds ? diffPixels : countExact(baseData, currentData)
  const exactRatio = exactDiffPixels / total
  const subtle = !exceeds && exactRatio > threshold
  // Group nearby changed rows into navigable regions; cap fragmentation at 100 regions.
  if (!withRegions)
    return {
      sizeMismatch: false,
      diffPixels,
      ratio,
      exceeds,
      diff,
      exactDiffPixels,
      exactRatio,
      subtle,
    }
  const regions: Box[] = []
  if (diffPixels)
    for (let y = 0; y < base.height; y++) {
      let left = base.width
      let right = -1
      for (let x = 0; x < base.width; x++) {
        const i = (y * base.width + x) * 4
        if (diff.data[i] === 255 && diff.data[i + 1] === 0 && diff.data[i + 2] === 0) {
          left = Math.min(left, x)
          right = x
        }
      }
      if (right < 0) continue
      const prev = regions[regions.length - 1]
      if (prev && (y - (prev.y + prev.h) <= 8 || regions.length >= 100)) {
        const end = Math.max(prev.x + prev.w, right + 1)
        prev.x = Math.min(prev.x, left)
        prev.w = end - prev.x
        prev.h = y - prev.y + 1
      } else regions.push({ x: left, y, w: right - left + 1, h: 1 })
    }
  return {
    sizeMismatch: false,
    diffPixels,
    ratio,
    exceeds,
    diff,
    regions,
    exactDiffPixels,
    exactRatio,
    subtle,
  }
}
