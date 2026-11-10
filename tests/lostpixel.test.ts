import { expect, it } from 'vitest'
import { convertLostPixel } from '../src/lib/lostpixel.ts'

it('turns page shots into routes, states, widths and masks', () => {
  const { manifest, notes } = convertLostPixel({
    breakpoints: [1280],
    pageShots: {
      baseUrl: 'http://172.17.0.1:3000',
      breakpoints: [390],
      mask: [{ selector: '[data-clock]' }],
      pages: [
        { path: '/', name: 'home' },
        { path: '/pricing?plan=pro', name: 'pricing-pro', mask: [{ selector: '.ad' }] },
        { path: '/pricing', name: 'pricing', threshold: 0.05, breakpoints: [768] },
        { path: 'about', name: 'about', waitBeforeScreenshot: 3000 },
      ],
    },
  })
  expect(manifest.baseUrl).toBe('http://localhost:3000')
  expect(manifest.viewports).toEqual([390, 768, 1280])
  expect(manifest.routes.map((r) => r.path)).toEqual(['/', '/pricing', '/about'])
  const pricing = manifest.routes.find((r) => r.path === '/pricing')
  expect(pricing?.states.map((s) => [s.name, s.query])).toEqual([
    ['pricing-pro', '?plan=pro'],
    ['pricing', undefined],
  ])
  expect(pricing?.states[0]?.masks?.map((m) => m.selector)).toEqual(['[data-clock]', '.ad'])
  expect(manifest.routes[0]?.states).toEqual([
    {
      name: 'ideal',
      masks: [{ selector: '[data-clock]', reason: 'Imported from Lost Pixel mask' }],
    },
  ])
  expect(notes.join('\n')).toMatch(/threshold 0\.05/)
  expect(notes.join('\n')).toMatch(/waitBeforeScreenshot 3000/)
  expect(notes.join('\n')).toMatch(/Docker bridge/)
})

it('merges pages from a pagesJsonUrl export and keeps state names unique', () => {
  const { manifest, notes } = convertLostPixel(
    {
      pageShots: {
        baseUrl: 'http://localhost:3000',
        pagesJsonUrl: 'http://x/pages.json',
        pages: [],
      },
    },
    [{ path: '/a', name: 'a' }, { path: '/a', name: 'a' }, { nope: true }],
  )
  expect(manifest.routes[0]?.states.map((s) => s.name)).toEqual(['a', 'a-2'])
  expect(manifest.viewports).toEqual([390, 1280])
  expect(notes.join('\n')).toContain('Skipped page entry 2')
})

it('refuses configs without page shots', () => {
  expect(() => convertLostPixel({})).toThrow('No pageShots')
  expect(() => convertLostPixel({ pageShots: { pages: [] } })).toThrow('no pages')
})
