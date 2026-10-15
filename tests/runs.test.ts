import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { loadReview, resolveRunDir, setLatest } from '../src/lib/runs.ts'

vi.mock('node:fs', async (original) => {
  const fs = await original<typeof import('node:fs')>()
  return {
    ...fs,
    symlinkSync: (...args: Parameters<typeof fs.symlinkSync>) => {
      if (process.env.SPINE_TEST_NO_SYMLINK) throw new Error('EPERM: symlink not permitted')
      return fs.symlinkSync(...args)
    },
  }
})

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

describe('latest pointer', () => {
  const project = (): string => {
    const root = mkdtempSync(join(tmpdir(), 'spine-latest-'))
    for (const id of ['run-a', 'run-b']) {
      mkdirSync(join(root, '.design-spine/runs', id), { recursive: true })
      writeFileSync(join(root, '.design-spine/runs', id, 'run.json'), '{}')
    }
    return root
  }
  it('uses a symlink when available', () => {
    const root = project()
    setLatest(root, 'run-a')
    expect(resolveRunDir(root)).toMatch(/run-a$/)
  })
  it('falls back to latest.txt when the symlink cannot be created', () => {
    const root = project()
    process.env.SPINE_TEST_NO_SYMLINK = '1'
    try {
      setLatest(root, 'run-a')
    } finally {
      delete process.env.SPINE_TEST_NO_SYMLINK
    }
    expect(readFileSync(join(root, '.design-spine/latest.txt'), 'utf8').trim()).toBe('run-a')
    expect(resolveRunDir(root)).toBe(join(root, '.design-spine/runs/run-a'))
  })
})
