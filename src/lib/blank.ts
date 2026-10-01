import type { PNG } from 'pngjs'
import type { Box } from './types.ts'

/** Luminance variance (0-255 scale) of a box in a PNG, inset to skip borders. */
export function regionVariance(png: PNG, box: Box, inset = 6): number {
  const x0 = Math.max(0, Math.floor(box.x + inset))
  const y0 = Math.max(0, Math.floor(box.y + inset))
  const x1 = Math.min(png.width, Math.ceil(box.x + box.w - inset))
  const y1 = Math.min(png.height, Math.ceil(box.y + box.h - inset))
  if (x1 <= x0 || y1 <= y0) return Number.POSITIVE_INFINITY
  let n = 0
  let sum = 0
  let sumSq = 0
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * png.width + x) * 4
      const l =
        0.2126 * (png.data[i] as number) +
        0.7152 * (png.data[i + 1] as number) +
        0.0722 * (png.data[i + 2] as number)
      sum += l
      sumSq += l * l
      n++
    }
  }
  const mean = sum / n
  return sumSq / n - mean * mean
}

export const BLANK_VARIANCE = 25

export function findBlankBoxes(png: PNG, candidates: Box[], maxVariance = BLANK_VARIANCE): Box[] {
  return candidates.filter((b) => regionVariance(png, b) <= maxVariance)
}
