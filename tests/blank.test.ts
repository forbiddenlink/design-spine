import { PNG } from 'pngjs'
import { describe, expect, it } from 'vitest'
import { findBlankBoxes, regionVariance } from '../src/lib/blank.ts'

function solid(w: number, h: number, rgb: [number, number, number]): PNG {
  const p = new PNG({ width: w, height: h })
  for (let i = 0; i < w * h; i++) {
    p.data[i * 4] = rgb[0]
    p.data[i * 4 + 1] = rgb[1]
    p.data[i * 4 + 2] = rgb[2]
    p.data[i * 4 + 3] = 255
  }
  return p
}

function noisy(p: PNG, x0: number, y0: number, w: number, h: number): void {
  for (let y = y0; y < y0 + h; y++)
    for (let x = x0; x < x0 + w; x++) {
      const v = (x + y) % 2 === 0 ? 0 : 255
      const i = (y * p.width + x) * 4
      p.data[i] = p.data[i + 1] = p.data[i + 2] = v
    }
}

describe('regionVariance', () => {
  it('is zero for a flat region', () => {
    expect(regionVariance(solid(300, 200, [240, 240, 240]), { x: 10, y: 10, w: 150, h: 100 })).toBe(
      0,
    )
  })
  it('is high for a checkerboard region', () => {
    const p = solid(300, 200, [255, 255, 255])
    noisy(p, 0, 0, 300, 200)
    expect(regionVariance(p, { x: 10, y: 10, w: 150, h: 100 })).toBeGreaterThan(10000)
  })
  it('ignores a 1px border thanks to the inset', () => {
    const p = solid(300, 200, [255, 255, 255])
    for (let x = 10; x < 160; x++) {
      for (const y of [10, 109]) {
        const i = (y * 300 + x) * 4
        p.data[i] = p.data[i + 1] = p.data[i + 2] = 0
      }
    }
    expect(regionVariance(p, { x: 10, y: 10, w: 150, h: 100 })).toBeLessThan(0.001)
  })
  it('treats a box with no pixels inside the image as non-blank', () => {
    expect(regionVariance(solid(50, 50, [0, 0, 0]), { x: 100, y: 100, w: 150, h: 100 })).toBe(
      Number.POSITIVE_INFINITY,
    )
  })
})

describe('findBlankBoxes', () => {
  it('keeps only the flat boxes', () => {
    const p = solid(400, 200, [250, 250, 250])
    noisy(p, 200, 0, 200, 200)
    const flat = { x: 0, y: 0, w: 180, h: 150 }
    const busy = { x: 200, y: 0, w: 180, h: 150 }
    expect(findBlankBoxes(p, [flat, busy])).toEqual([flat])
  })
})
