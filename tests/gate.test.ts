import { describe, expect, it } from 'vitest'
import { evaluateGate } from '../src/lib/gate.ts'
import type { ReviewFile, RunRecord } from '../src/lib/types.ts'

const run = {
  schemaVersion: 2,
  id: 'test',
  startedAt: '',
  finishedAt: '',
  baseUrl: 'http://localhost',
  tiles: [{ id: 'one', recipeHash: 'a'.repeat(64) }],
  coverage: [{ id: 'one', outcome: 'captured' }],
  provenance: { browser: 'Chromium 1', runtime: 'Bun 1', platform: 'darwin/arm64', policy: {} },
} as RunRecord
const review: ReviewFile = { tiles: { one: { decision: 'approve', note: '', updatedAt: '' } } }

const tile = run.tiles[0]
const provenance = run.provenance
if (!tile || !provenance) throw new Error('Incomplete fixture')

describe('strict release gate', () => {
  it('passes fully covered, approved, unchanged evidence', () => {
    expect(
      evaluateGate(run, review, [{ id: 'one', result: 'ok' }], {
        one: { provenance: run.provenance, recipeHash: 'a'.repeat(64) },
      }),
    ).toEqual([])
  })
  it('refuses legacy evidence with unknown coverage or provenance', () => {
    expect(
      evaluateGate({ ...run, coverage: undefined, provenance: undefined }, review, []),
    ).toContain('Coverage unknown; recapture with this version.')
  })
  it.each(['new', 'CHANGED', 'size-changed', 'no-capture'])('fails %s evidence', (result) => {
    expect(
      evaluateGate(run, review, [{ id: 'one', result }], {
        one: { provenance: run.provenance, recipeHash: 'a'.repeat(64) },
      }).length,
    ).toBeGreaterThan(0)
  })
  it('does not count absent or skipped planned evidence as reviewed', () => {
    const incomplete = {
      ...run,
      coverage: [
        ...(run.coverage ?? []),
        { id: 'missing', outcome: 'captured' },
        { id: 'todo', outcome: 'skipped' },
      ],
    } as RunRecord
    const reasons = evaluateGate(incomplete, review, [{ id: 'one', result: 'ok' }], {
      one: { provenance: run.provenance, recipeHash: 'a'.repeat(64) },
    })
    expect(reasons.some((r) => r.includes('missing'))).toBe(true)
    expect(reasons.some((r) => r.includes('todo'))).toBe(true)
  })
  it('fails pending, rejected, unstable and incompatible evidence', () => {
    expect(
      evaluateGate(run, { tiles: {} }, [{ id: 'one', result: 'ok' }]).some((r) =>
        r.includes('pending'),
      ),
    ).toBe(true)
    expect(
      evaluateGate(
        run,
        { tiles: { one: { decision: 'reject', note: '', updatedAt: '' } } },
        [],
      ).some((r) => r.includes('rejected')),
    ).toBe(true)
    expect(
      evaluateGate({ ...run, tiles: [{ ...tile, stability: 'unstable' }] }, review, []).some((r) =>
        r.includes('unstable'),
      ),
    ).toBe(true)
    expect(
      evaluateGate(run, review, [{ id: 'one', result: 'ok' }], {
        one: { provenance: { ...provenance, browser: 'Other' }, recipeHash: 'a'.repeat(64) },
      }).some((r) => r.includes('incompatible')),
    ).toBe(true)
  })
})

it('refuses filtered coverage, even when the filtered state was unfinished', () => {
  const filtered = {
    ...run,
    coverage: [
      ...(run.coverage ?? []),
      {
        id: 'filtered',
        outcome: 'excluded',
        reason: 'Outside selected routes',
        exclusionSource: 'route-filter',
      },
    ],
  } as RunRecord
  expect(
    evaluateGate(filtered, review, [{ id: 'one', result: 'ok' }], {
      one: { provenance: run.provenance, recipeHash: 'a'.repeat(64) },
    }).some((reason) => reason.includes('filtered')),
  ).toBe(true)
})

it('refuses filtered coverage recorded with the filtered outcome', () => {
  const filtered = {
    ...run,
    coverage: [...(run.coverage ?? []), { id: 'filtered', outcome: 'filtered' }],
  } as RunRecord
  expect(
    evaluateGate(filtered, review, [{ id: 'one', result: 'ok' }], {
      one: { provenance: run.provenance, recipeHash: 'a'.repeat(64) },
    }).some((reason) => reason.includes('incomplete coverage (filtered)')),
  ).toBe(true)
})

it('does not require identical runtime versions between capture and baseline', () => {
  const reasons = evaluateGate(run, review, [{ id: 'one', result: 'ok' }], {
    one: {
      provenance: { ...provenance, runtime: 'Bun 9.9.9' },
      recipeHash: 'a'.repeat(64),
    },
  })
  expect(reasons.some((r) => r.includes('incompatible'))).toBe(false)
})

it('refuses different recipes even with unchanged pixels and matching environment', () => {
  expect(
    evaluateGate(run, review, [{ id: 'one', result: 'ok' }], {
      one: { provenance, recipeHash: 'b'.repeat(64) },
    }).some((reason) => reason.includes('capture recipe')),
  ).toBe(true)
})
