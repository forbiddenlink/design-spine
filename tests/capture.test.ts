import { describe, expect, it } from 'vitest'
import {
  assertReachable,
  markUnappliedDarkTheme,
  planJobs,
  requestFailureCode,
  retryDelayMs,
} from '../src/lib/capture.ts'
import type { Manifest } from '../src/lib/types.ts'

const manifest: Manifest = {
  baseUrl: 'http://localhost:3000',
  viewports: [390, 1280],
  themes: { light: 'light', dark: 'dark', method: 'media' },
  routes: [{ path: '/a/b', states: [{ name: 'ideal' }, { name: 'loading', todo: true }] }],
}

it('preserves HTTP/2 failure codes without recording arbitrary error details', () => {
  expect(requestFailureCode('net::ERR_HTTP2_PROTOCOL_ERROR')).toBe('net::ERR_HTTP2_PROTOCOL_ERROR')
  expect(requestFailureCode('net::ERR_FAILED at https://example.test/?token=private')).toBe(
    'net::ERR_FAILED',
  )
  expect(requestFailureCode('Unexpected https://example.test/?token=private')).toBe(
    'Network request failed',
  )
  expect(requestFailureCode(undefined)).toBe('Network request failed')
})

describe('capture planning', () => {
  it('keeps the documented state/viewport/theme matrix and skips todo states', () => {
    const { jobs, coverage } = planJobs(manifest)
    expect(jobs).toHaveLength(4)
    expect(new Set(jobs.map((job) => `${job.viewport}/${job.theme}`)).size).toBe(4)
    expect(coverage.filter((entry) => entry.outcome === 'skipped')).toHaveLength(4)
    expect(coverage).toHaveLength(8)
  })
  it('keeps unfinished dynamic params out of captures and records explicit exclusions', () => {
    const { jobs, coverage } = planJobs({
      ...manifest,
      routes: [
        { path: '/blog/[slug]', params: { slug: 'TODO' }, states: [{ name: 'ideal' }] },
        { path: '/admin', states: [{ name: 'ideal', exclude: 'Not part of this release' }] },
      ],
    })
    expect(jobs).toHaveLength(0)
    expect(coverage.filter((entry) => entry.outcome === 'skipped')).toHaveLength(4)
    expect(coverage.filter((entry) => entry.outcome === 'excluded')).toHaveLength(4)
  })
  it('rejects routes that map to the same existing filename before capture overwrites evidence', () => {
    const colliding = {
      ...manifest,
      routes: [...manifest.routes, { path: '/a-b', states: [{ name: 'ideal' }] }],
    }
    expect(() => planJobs(colliding)).toThrow('same capture filename')
    // Names the routes and does not blame state names when the route slugs collide.
    expect(() => planJobs(colliding)).toThrow(/\/a\/b and \/a-b/)
    expect(() => planJobs(colliding)).not.toThrow('distinct state names')
  })
  it('treats filenames that differ only by case as a collision', () => {
    expect(() =>
      planJobs({
        ...manifest,
        routes: [
          { path: '/About', states: [{ name: 'ideal' }] },
          { path: '/about', states: [{ name: 'ideal' }] },
        ],
      }),
    ).toThrow('same capture filename')
  })
  it('records routes left out by --routes as filtered, not excluded', () => {
    const { coverage } = planJobs(
      {
        ...manifest,
        routes: [...manifest.routes, { path: '/other', states: [{ name: 'ideal' }] }],
      },
      ['/a/b'],
    )
    expect(coverage.filter((e) => e.outcome === 'filtered')).toHaveLength(4)
    expect(coverage.filter((e) => e.outcome === 'excluded')).toHaveLength(0)
    expect(coverage.filter((e) => e.outcome === 'filtered').every((e) => e.reason)).toBe(true)
  })
  it('rejects state names that sanitize to the same filename', () => {
    expect(() =>
      planJobs({
        ...manifest,
        routes: [{ path: '/', states: [{ name: 'has data' }, { name: 'has-data' }] }],
      }),
    ).toThrow('same capture filename')
  })
  it('limits collision checks to selected routes', () => {
    expect(
      planJobs(
        {
          ...manifest,
          routes: [...manifest.routes, { path: '/a-b', states: [{ name: 'ideal' }] }],
        },
        ['/a/b'],
      ).jobs,
    ).toHaveLength(4)
  })
})

describe('retryDelayMs', () => {
  it('uses Retry-After seconds, capped at 10, defaulting to 2s', () => {
    expect(retryDelayMs('3')).toBe(3000)
    expect(retryDelayMs('0')).toBe(0)
    expect(retryDelayMs('120')).toBe(10000)
    expect(retryDelayMs(undefined)).toBe(2000)
    expect(retryDelayMs('Wed, 21 Oct 2026 07:28:00 GMT')).toBe(2000)
    expect(retryDelayMs('-5')).toBe(2000)
  })
})

describe('reachability check', () => {
  it('names the URL and how to fix it when nothing is listening', async () => {
    const { createServer } = await import('node:net')
    const probe = createServer()
    await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve))
    const address = probe.address()
    if (!address || typeof address === 'string') throw new Error('No address')
    await new Promise<void>((resolve) => probe.close(() => resolve()))
    await expect(assertReachable(`http://127.0.0.1:${address.port}/`, 2000)).rejects.toThrow(
      /Nothing answered at http:\/\/127\.0\.0\.1:\d+\/ .*Start the app/,
    )
  })
  it('accepts any HTTP response, including errors and redirects', async () => {
    const { createServer } = await import('node:http')
    const server = createServer((_req, res) => {
      res.statusCode = 302
      res.setHeader('location', '/login')
      res.end()
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('No address')
    await expect(assertReachable(`http://127.0.0.1:${address.port}/`)).resolves.toBeUndefined()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })
})

describe('dark theme check', () => {
  const tile = (theme: 'light' | 'dark', imageHash: string, viewport = 390) =>
    ({
      id: `${theme}-${viewport}`,
      route: '/',
      state: 'ideal',
      viewport,
      theme,
      imageHash,
    }) as never
  it('warns only on dark tiles identical to their light twin', () => {
    const tiles = [
      tile('light', 'a'),
      tile('dark', 'a'),
      tile('light', 'b', 1280),
      tile('dark', 'c', 1280),
    ]
    markUnappliedDarkTheme(tiles)
    const warned = (tiles as { id: string; warnings?: string[] }[]).filter(
      (t) => t.warnings?.length,
    )
    expect(warned.map((t) => t.id)).toEqual(['dark-390'])
  })
})
