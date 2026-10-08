import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { draftManifest, fillParams, findAppDir, scanRoutes } from '../src/lib/routes.ts'

const dir = mkdtempSync(join(tmpdir(), 'spine-routes-'))
const put = (p: string): void => {
  mkdirSync(join(dir, p, '..'), { recursive: true })
  writeFileSync(join(dir, p), 'export default function P(){return null}')
}
for (const p of [
  'page.tsx',
  'about/page.tsx',
  '(marketing)/pricing/page.tsx',
  '(marketing)/(deep)/faq/page.tsx',
  'blog/[slug]/page.tsx',
  'docs/[...path]/page.tsx',
  '@modal/login/page.tsx',
  '_private/page.tsx',
  '(.)photo/page.tsx',
  'api/health/route.ts',
  'empty/layout.tsx',
]) {
  put(p)
}
afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe('scanRoutes', () => {
  it('drops route groups and lists dynamic segments separately', () => {
    const r = scanRoutes(dir)
    expect(r.static).toEqual(['/', '/about', '/faq', '/pricing'])
    expect(r.dynamic).toEqual(['/blog/[slug]', '/docs/[...path]'])
  })
})

describe('draftManifest', () => {
  const m = draftManifest(scanRoutes(dir), 'http://localhost:3000')
  it('has the expected shape', () => {
    expect(m.baseUrl).toBe('http://localhost:3000')
    expect(m.viewports).toEqual([390, 1280])
    expect(m.themes.method).toBe('localStorage')
    expect(m.routes).toHaveLength(6)
  })
  it('static routes: ideal live, suggested states todo', () => {
    const about = m.routes.find((r) => r.path === '/about')
    expect(about?.states.map((s) => [s.name, !!s.todo])).toEqual([
      ['ideal', false],
      ['empty', true],
      ['loading', true],
      ['error', true],
    ])
  })
  it('dynamic routes carry params placeholders and a todo ideal', () => {
    const blog = m.routes.find((r) => r.path === '/blog/[slug]')
    expect(blog?.params).toEqual({ slug: 'TODO' })
    expect(blog?.states[0]?.todo).toBe(true)
    expect(fillParams('/blog/[slug]', { slug: 'hello' })).toBe('/blog/hello')
  })
})

describe('explicit app directory', () => {
  it('accepts an existing directory', () => {
    expect(findAppDir(dir, dir)).toBe(dir)
  })
  it('rejects a regular file rather than writing a misleading empty route manifest', () => {
    expect(findAppDir(dir, join(dir, 'page.tsx'))).toBeNull()
  })
})
