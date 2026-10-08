import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadReview } from '../src/lib/runs.ts'

describe('review recovery', () => {
  it('uses an empty review only when the optional file does not exist', () => {
    expect(loadReview(mkdtempSync(join(tmpdir(), 'spine-review-empty-')))).toEqual({ tiles: {} })
  })
  it.each([
    '{broken',
    'null',
    '{"tiles":null}',
    '{"tiles":[]}',
    '{"tiles":{"tile":null}}',
    '{"tiles":{"tile":{"decision":"approve","note":7}}}',
  ])('preserves corrupt review bytes and refuses to treat %s as an empty review', (content) => {
    const dir = mkdtempSync(join(tmpdir(), 'spine-review-corrupt-'))
    const file = join(dir, 'review.json')
    writeFileSync(file, content)
    expect(() => loadReview(dir)).toThrow('Invalid review.json')
    expect(readFileSync(file, 'utf8')).toBe(content)
  })
})
