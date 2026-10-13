import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { buildReport } from '../src/lib/report.ts'
import type { RunRecord } from '../src/lib/types.ts'

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true })
})
it('creates an offline report with escaped notes and embedded original evidence', () => {
  const dir = mkdtempSync(join(tmpdir(), 'spine-report-'))
  dirs.push(dir)
  writeFileSync(join(dir, 'shot.png'), Buffer.from('image'))
  const run = {
    id: 'run',
    tiles: [
      {
        id: 'a',
        file: 'shot.png',
        route: '</script><img>',
        state: 'default',
        viewport: 390,
        theme: 'light',
      },
    ],
  } as RunRecord
  const html = buildReport(dir, run, {
    tiles: { a: { decision: 'reject', note: '<script>alert(1)</script>', updatedAt: '' } },
  })
  expect(html).toContain('data:image/png;base64,aW1hZ2U=')
  expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
  expect(html).not.toContain('<script>')
  expect(html).toContain('Coverage unknown')
})
it('refuses screenshots outside the run, including symlinks', () => {
  const dir = mkdtempSync(join(tmpdir(), 'spine-report-'))
  dirs.push(dir)
  mkdirSync(join(dir, 'run'))
  writeFileSync(join(dir, 'outside.png'), 'outside')
  symlinkSync(join(dir, 'outside.png'), join(dir, 'run', 'shot.png'))
  const run = { id: 'run', tiles: [{ id: 'a', file: 'shot.png' }] } as RunRecord
  expect(() => buildReport(join(dir, 'run'), run, { tiles: {} })).toThrow(/outside/)
})

it('retains automated scan failures and findings in exported evidence', () => {
  const dir = mkdtempSync(join(tmpdir(), 'spine-report-'))
  dirs.push(dir)
  writeFileSync(join(dir, 'shot.png'), 'image')
  const run = {
    id: 'run',
    tiles: [
      {
        id: 'a',
        file: 'shot.png',
        accessibility: {
          engine: 'axe',
          violations: [
            { id: 'label', impact: 'critical', help: 'Form label missing', targets: ['#name'] },
          ],
          error: 'Scan timed out',
        },
        warnings: ['Assets did not settle'],
        overflowX: true,
        status: 500,
      },
    ],
  } as RunRecord
  const html = buildReport(dir, run, { tiles: {} })
  expect(html).toContain('Scan timed out')
  expect(html).toContain('Form label missing')
  expect(html).toContain('Assets did not settle')
  expect(html).toContain('HTTP 500')
})
