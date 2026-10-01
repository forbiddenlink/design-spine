import { describe, expect, it } from 'vitest'
import { isFlagged } from '../src/lib/runs'
import type { Tile } from '../src/lib/types'

const clean: Tile = {
  id: 'a',
  file: 'a.png',
  route: '/a',
  path: '/a',
  state: 'ideal',
  viewport: 390,
  theme: 'light',
  status: 200,
  consoleErrors: [],
  pageErrors: [],
  overflowX: false,
  blankRegions: { count: 0, boxes: [] },
  brokenImages: [],
  textClipped: [],
}

describe('isFlagged', () => {
  it('leaves a clean tile unflagged, even with intentional clipping noted', () => {
    expect(isFlagged({ ...clean, textClipped: [{ selector: 'p', text: 'x' }] })).toBe(false)
  })

  it('flags a route that redirected, such as a gated page bouncing to /login', () => {
    expect(isFlagged({ ...clean, redirectedTo: '/login' })).toBe(true)
  })

  it('does not flag a capture note about network idle', () => {
    expect(
      isFlagged({ ...clean, warnings: ['network never went idle; captured after load'] }),
    ).toBe(false)
  })
})
