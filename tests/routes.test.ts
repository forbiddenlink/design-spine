import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { validateManifest } from '../src/lib/manifest.ts'
import {
  draftManifest,
  fillParams,
  findAppDir,
  hasPagesRouter,
  scanRoutes,
  slugCollisions,
} from '../src/lib/routes.ts'

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
  it('static routes get only an ideal state', () => {
    const about = m.routes.find((r) => r.path === '/about')
    expect(about?.states.map((s) => [s.name, !!s.todo])).toEqual([['ideal', false]])
  })
  it('--all-states restores empty/loading/error todo states on static routes', () => {
    const all = draftManifest(scanRoutes(dir), 'http://localhost:3000', true)
    const about = all.routes.find((r) => r.path === '/about')
    expect(about?.states.map((s) => [s.name, !!s.todo])).toEqual([
      ['ideal', false],
      ['empty', true],
      ['loading', true],
      ['error', true],
    ])
  })
  it('dynamic routes carry params placeholders and a todo ideal', () => {
    const blog = m.routes.find((r) => r.path === '/blog/[slug]')
    expect(blog?.states.map((s) => s.name)).toEqual(['ideal', 'empty', 'loading', 'error'])
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

describe('route scan edge cases', () => {
  const edge = mkdtempSync(join(tmpdir(), 'spine-routes-edge-'))
  const file = (p: string): void => {
    mkdirSync(join(edge, p, '..'), { recursive: true })
    writeFileSync(join(edge, p), 'export default function P(){return null}')
  }
  for (const p of [
    'dash/page.tsx',
    'dash/loading.tsx',
    'dash/error.jsx',
    'plain/page.tsx',
    'shop/[[...slug]]/page.tsx',
    'a-b/page.tsx',
    'a/b/page.tsx',
  ])
    file(p)
  symlinkSync(join(edge, 'missing-target'), join(edge, 'dangling'))
  symlinkSync(join(edge, 'missing-target'), join(edge, 'dash/page.mdx'))
  afterAll(() => rmSync(edge, { recursive: true, force: true }))

  it('skips dangling symlinks instead of crashing', () => {
    expect(scanRoutes(edge).static).toContain('/plain')
  })
  it('adds loading/error todo states only where those files exist', () => {
    const m = draftManifest(scanRoutes(edge))
    const names = (p: string): string[] | undefined =>
      m.routes.find((r) => r.path === p)?.states.map((s) => s.name)
    expect(names('/dash')).toEqual(['ideal', 'loading', 'error'])
    expect(names('/plain')).toEqual(['ideal'])
  })
  it('emits the bare base route for an optional catch-all', () => {
    const r = scanRoutes(edge)
    expect(r.static).toContain('/shop')
    expect(r.dynamic).toContain('/shop/[[...slug]]')
  })
  it('reports routes whose tile filenames collide', () => {
    expect(slugCollisions(['/a-b', '/a/b', '/c'])).toEqual([['/a-b', '/a/b']])
    expect(slugCollisions(['/a', '/b'])).toEqual([])
  })
  it('detects an unsupported pages router only when there is no app dir', () => {
    const pages = mkdtempSync(join(tmpdir(), 'spine-routes-pages-'))
    mkdirSync(join(pages, 'pages'))
    expect(hasPagesRouter(pages)).toBe(true)
    mkdirSync(join(pages, 'app'))
    expect(hasPagesRouter(pages)).toBe(false)
    rmSync(pages, { recursive: true, force: true })
  })
})

describe('scanRoutes symlinks', () => {
  it('does not follow a symlink back into its own tree', () => {
    const d = mkdtempSync(join(tmpdir(), 'spine-routes-links-'))
    mkdirSync(join(d, 'about'), { recursive: true })
    for (const p of ['page.tsx', 'about/page.tsx']) writeFileSync(join(d, p), 'export default 1')
    symlinkSync('.', join(d, 'about/loop'))
    symlinkSync('missing-target', join(d, 'dangling'))
    expect(scanRoutes(d).static).toEqual(['/', '/about'])
    rmSync(d, { recursive: true, force: true })
  })
})

it('warns about routes that differ only by case', async () => {
  const { slugCollisions } = await import('../src/lib/routes.ts')
  expect(slugCollisions(['/About', '/about', '/contact'])).toEqual([['/About', '/about']])
})

it('drafts manifests with stable capture defaults', () => {
  const m = draftManifest({ static: ['/'], dynamic: [] }, 'http://localhost:3000')
  expect(m.capture).toEqual({ animations: 'disabled', stabilityAttempts: 3 })
  expect(() => validateManifest(m)).not.toThrow()
})
