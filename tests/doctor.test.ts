import { describe, expect, it } from 'vitest'
import { unfinishedLines } from '../src/lib/doctor.ts'
import type { CoverageEntry } from '../src/lib/types.ts'

const tiles = (route: string, state: string, n: number): CoverageEntry[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `${route}-${state}-${i}`,
    route,
    state,
    viewport: 390,
    theme: 'light',
    outcome: 'skipped',
    reason: `${state} setup`,
  }))

describe('unfinishedLines', () => {
  it('groups tiles per route and state', () => {
    const lines = unfinishedLines([
      ...tiles('/tank/[tankId]', 'loading', 4),
      ...tiles('/a', 'empty', 1),
    ])
    expect(lines).toEqual([
      '/tank/[tankId] · loading (4 tiles): loading setup',
      '/a · empty (1 tile): empty setup',
    ])
  })
  it('caps the grouped list and points at --verbose', () => {
    const coverage = Array.from({ length: 45 }, (_, i) => tiles(`/r${i}`, 'empty', 2)).flat()
    const lines = unfinishedLines(coverage)
    expect(lines).toHaveLength(41)
    expect(lines[40]).toBe('5 more, use --verbose')
  })
  it('lists every tile with verbose and ignores non-skipped outcomes', () => {
    const coverage = [
      ...tiles('/a', 'empty', 90),
      { ...tiles('/b', 'ideal', 1)[0], outcome: 'captured' },
    ]
    expect(unfinishedLines(coverage as CoverageEntry[], true)).toHaveLength(90)
  })
})
