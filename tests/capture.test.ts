import { describe, expect, it } from 'vitest'
import { planJobs } from '../src/lib/capture.ts'
import type { Manifest } from '../src/lib/types.ts'

const manifest: Manifest = {
  baseUrl: 'http://localhost:3000',
  viewports: [390, 1280],
  themes: { light: 'light', dark: 'dark', method: 'media' },
  routes: [{ path: '/a/b', states: [{ name: 'ideal' }, { name: 'loading', todo: true }] }],
}

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
    expect(() =>
      planJobs({
        ...manifest,
        routes: [...manifest.routes, { path: '/a-b', states: [{ name: 'ideal' }] }],
      }),
    ).toThrow('same capture filename')
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
