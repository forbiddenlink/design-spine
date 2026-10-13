import { PNG } from 'pngjs'
import { describe, expect, it } from 'vitest'
import { compareImages } from '../src/lib/diff.ts'

function solid(w: number, h: number, v: number): PNG {
  const p = new PNG({ width: w, height: h })
  p.data.fill(v)
  for (let i = 3; i < p.data.length; i += 4) p.data[i] = 255
  return p
}

describe('compareImages', () => {
  it('reports identical images as unchanged', () => {
    const r = compareImages(solid(100, 100, 200), solid(100, 100, 200), 0.002)
    expect(r).toMatchObject({ sizeMismatch: false, diffPixels: 0, ratio: 0, exceeds: false })
  })
  it('flags a size mismatch as changed without resizing', () => {
    const r = compareImages(solid(100, 100, 200), solid(100, 120, 200), 0.5)
    expect(r).toMatchObject({ sizeMismatch: true, exceeds: true })
    expect(r.diff).toBeUndefined()
  })
  it('applies the ratio threshold', () => {
    const a = solid(100, 100, 255)
    const b = solid(100, 100, 255)
    for (let y = 0; y < 5; y++)
      for (let x = 0; x < 100; x++) {
        const i = (y * 100 + x) * 4
        b.data[i] = b.data[i + 1] = b.data[i + 2] = 0
      }
    const r = compareImages(a, b, 0.002)
    expect(r.diffPixels).toBe(500)
    expect(r.ratio).toBeCloseTo(0.05)
    expect(r.exceeds).toBe(true)
    expect(compareImages(a, b, 0.1).exceeds).toBe(false)
  })
  it('locates a small lower-page change even below the global threshold', () => {
    const a = solid(100, 2000, 255)
    const b = solid(100, 2000, 255)
    for (let y = 1900; y < 1904; y++)
      for (let x = 20; x < 24; x++) {
        const i = (y * 100 + x) * 4
        b.data[i] = b.data[i + 1] = b.data[i + 2] = 0
      }
    const result = compareImages(a, b, 0.002)
    expect(result.exceeds).toBe(false)
    expect(result.regions).toEqual([{ x: 20, y: 1900, w: 4, h: 4 }])
    const before = Buffer.from(b.data)
    const masked = compareImages(a, b, 0, 0.1, [{ x: 20, y: 1900, w: 3, h: 4 }])
    expect(masked.diffPixels).toBe(4)
    expect(b.data.equals(before)).toBe(true)
  })
})
