import { describe, expect, it } from 'vitest'
import { validateManifest } from '../src/lib/manifest.ts'

const valid = {
  baseUrl: 'http://localhost:3000',
  viewports: [390, 1280],
  themes: { light: 'light', dark: 'dark', method: 'media' },
  routes: [{ path: '/', states: [{ name: 'ideal' }] }],
}

describe('manifest preflight', () => {
  it('accepts existing manifests without requiring new fields', () => {
    expect(validateManifest(valid)).toEqual(valid)
  })
  it.each([
    { ...valid, viewports: [0] },
    { ...valid, viewports: [390, 390] },
    { ...valid, themes: { ...valid.themes, method: 'unknown' } },
    { ...valid, baseUrl: 'file:///etc/passwd' },
    { ...valid, routes: [{ path: '//external.test', states: [{ name: 'ideal' }] }] },
    { ...valid, routes: [{ path: '/', states: [{ name: '' }] }] },
    { ...valid, routes: [{ path: '/', states: [{ name: 'ideal', typo: true }] }] },
  ])('rejects malformed configuration before capture', (value) => {
    expect(() => validateManifest(value)).toThrow('manifest')
  })
})

it.each([
  { ...valid, themes: { ...valid.themes, method: ['class'] } },
  { ...valid, capture: { animations: ['disabled'] } },
  {
    ...valid,
    routes: [
      {
        path: '/',
        states: [{ name: 'ideal', steps: [{ action: ['click'], selector: 'button' }] }],
      },
    ],
  },
])('rejects arrays masquerading as enum strings', (value) => {
  expect(() => validateManifest(value)).toThrow('manifest')
})
