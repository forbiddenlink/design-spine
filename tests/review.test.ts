import { describe, expect, it } from 'vitest'
import { mergeReview } from '../src/lib/review.ts'

describe('mergeReview', () => {
  const t0 = '2026-10-01T00:00:00.000Z'
  const t1 = '2026-10-01T00:01:00.000Z'
  it('creates an entry from nothing', () => {
    expect(mergeReview(null, { tileId: 'a', decision: 'approve' }, t0).tiles.a).toEqual({
      decision: 'approve',
      note: '',
      updatedAt: t0,
    })
  })
  it('keeps the decision when only the note changes, and vice versa', () => {
    const a = mergeReview(null, { tileId: 'a', decision: 'reject' }, t0)
    const b = mergeReview(a, { tileId: 'a', note: 'card empty' }, t1)
    expect(b.tiles.a).toEqual({ decision: 'reject', note: 'card empty', updatedAt: t1 })
    const c = mergeReview(b, { tileId: 'a', decision: null }, t1)
    expect(c.tiles.a?.note).toBe('card empty')
    expect(c.tiles.a?.decision).toBeNull()
  })
  it('does not mutate the input or touch other tiles', () => {
    const a = mergeReview(null, { tileId: 'a', decision: 'approve' }, t0)
    const b = mergeReview(a, { tileId: 'b', decision: 'reject' }, t1)
    expect(a.tiles.b).toBeUndefined()
    expect(b.tiles.a?.decision).toBe('approve')
  })
})

it('preserves an image-bound note location until explicitly cleared', () => {
  const anchor = { x: 10, y: 20, imageHash: 'a'.repeat(64) }
  const initial = mergeReview(null, { tileId: 'a', anchor })
  expect(mergeReview(initial, { tileId: 'a', decision: 'reject' }).tiles.a?.anchor).toEqual(anchor)
  expect(mergeReview(initial, { tileId: 'a', anchor: null }).tiles.a?.anchor).toBeUndefined()
})
