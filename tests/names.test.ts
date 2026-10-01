import { describe, expect, it } from 'vitest'
import { routeSlug, runIdFromDate, tileFilename, tileId } from '../src/lib/names.ts'

describe('tile names', () => {
  it('builds route__state__vw__theme.png', () => {
    expect(tileFilename('/pricing', 'ideal', 390, 'dark')).toBe('pricing__ideal__390__dark.png')
  })
  it('maps root to home and nested paths to dashes', () => {
    expect(routeSlug('/')).toBe('home')
    expect(tileId('/a/b/', 'empty', 1280, 'light')).toBe('a-b__empty__1280__light')
  })
  it('sanitizes query strings, spaces and unsafe characters', () => {
    expect(routeSlug('/search?q=a b')).toBe('search')
    expect(tileFilename('/x', 'has data!', 390, 'light')).toBe('x__has-data__390__light.png')
  })
  it('makes filesystem-safe run ids', () => {
    expect(runIdFromDate(new Date('2026-10-01T12:34:56.789Z'))).toBe('2026-10-01T12-34-56-789Z')
  })
})
