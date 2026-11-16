import { describe, expect, it } from 'vitest'
import { type CauseInput, changeSignature, groupByCause } from '../src/lib/cause.ts'

const tile = (id: string, over: Partial<CauseInput> = {}): CauseInput => ({
  id,
  viewport: 1280,
  theme: 'light',
  width: 1280,
  height: 2000,
  ratio: 0.004,
  regions: [{ x: 0, y: 10, w: 1280, h: 60 }],
  ...over,
})

describe('changeSignature', () => {
  it('is deterministic and ignores route-like identity', () => {
    expect(changeSignature(tile('a'))).toBe(changeSignature(tile('b')))
  })
  it('tolerates a couple of pixels of jitter but not a different place', () => {
    const jitter = tile('b', { regions: [{ x: 2, y: 12, w: 1276, h: 58 }] })
    expect(changeSignature(jitter)).toBe(changeSignature(tile('a')))
    const lower = tile('c', { regions: [{ x: 0, y: 900, w: 1280, h: 60 }] })
    expect(changeSignature(lower)).not.toBe(changeSignature(tile('a')))
  })
  it('separates viewport, theme and size of change', () => {
    const base = changeSignature(tile('a'))
    expect(changeSignature(tile('b', { viewport: 390 }))).not.toBe(base)
    expect(changeSignature(tile('b', { theme: 'dark' }))).not.toBe(base)
    expect(changeSignature(tile('b', { ratio: 0.3 }))).not.toBe(base)
  })
  it('returns null with nothing changed', () => {
    expect(changeSignature(tile('a', { regions: [] }))).toBeNull()
  })
})

describe('groupByCause', () => {
  it('groups equal signatures, drops singletons, orders big groups first', () => {
    const lower = { regions: [{ x: 0, y: 900, w: 1280, h: 60 }] }
    const groups = groupByCause([
      tile('a'),
      tile('x', lower),
      tile('b'),
      tile('c'),
      tile('y', lower),
      tile('lonely', { regions: [{ x: 600, y: 1500, w: 50, h: 50 }] }),
    ])
    expect(groups.map((g) => g.tileIds)).toEqual([
      ['a', 'b', 'c'],
      ['x', 'y'],
    ])
    expect(groups[0]?.label).toBe('3 tiles, same change near top 0-80px')
    expect(groups[0]?.position).toBe('top')
  })
})
