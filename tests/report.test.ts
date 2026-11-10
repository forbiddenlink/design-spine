import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PNG } from 'pngjs'
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
        requestErrors: [
          {
            url: 'https://example.test/api/<unsafe>',
            resourceType: 'fetch',
            status: 429,
            elapsedMs: 123,
          },
          {
            url: 'https://example.test/image.png',
            resourceType: 'image',
            failure: 'net::ERR_FAILED',
            elapsedMs: 456,
          },
        ],
      },
    ],
  } as RunRecord
  const html = buildReport(dir, run, { tiles: {} })
  expect(html).toContain('Scan timed out')
  expect(html).toContain('Form label missing')
  expect(html).toContain('Assets did not settle')
  expect(html).toContain('HTTP 500')
  expect(html).toContain('HTTP 429 · fetch · +123 ms · https://example.test/api/&lt;unsafe&gt;')
  expect(html).toContain('net::ERR_FAILED · image · +456 ms · https://example.test/image.png')
  expect(html).not.toContain('/api/<unsafe>')
})

it('leads with a summary and lists rejected and flagged screens before approved ones', () => {
  const dir = mkdtempSync(join(tmpdir(), 'spine-report-'))
  dirs.push(dir)
  writeFileSync(join(dir, 'shot.png'), 'image')
  const tile = (id: string, extra = {}) => ({
    id,
    file: 'shot.png',
    route: `/${id}`,
    state: 'ideal',
    viewport: 390,
    theme: 'light',
    status: 200,
    ...extra,
  })
  const run = {
    id: 'run',
    tiles: [tile('approved'), tile('flagged', { overflowX: true }), tile('rejected'), tile('open')],
  } as RunRecord
  const html = buildReport(dir, run, {
    tiles: {
      approved: { decision: 'approve', note: '', updatedAt: '' },
      rejected: { decision: 'reject', note: 'Fix spacing', updatedAt: '' },
    },
  })
  expect(html).toContain('<main>')
  expect(html).toContain('<li><b>4</b> Screens</li>')
  expect(html).toContain('<li><b>1</b> With findings</li>')
  const order = ['rejected', 'flagged', 'open', 'approved'].map((id) =>
    html.indexOf(`<article id="tile-${id}"`),
  )
  expect(order).toEqual([...order].sort((a, b) => a - b))
  expect(html).toContain('horizontal overflow')
})

it('draws blank regions and overflow culprits on the screenshot in image pixels', () => {
  const dir = mkdtempSync(join(tmpdir(), 'spine-report-'))
  dirs.push(dir)
  writeFileSync(join(dir, 'shot.png'), PNG.sync.write(new PNG({ width: 780, height: 400 })))
  const run = {
    id: 'run',
    tiles: [
      {
        id: 'a',
        file: 'shot.png',
        route: '/cards',
        state: 'ideal',
        viewport: 390,
        theme: 'light',
        overflowX: true,
        overflowOffenders: [{ selector: 'div.wide', box: { x: 0, y: 40, w: 900, h: 60 } }],
        blankRegions: { count: 1, boxes: [{ x: 10, y: 120, w: 300, h: 180 }] },
      },
    ],
  } as RunRecord
  const html = buildReport(dir, run, { tiles: {} })
  expect(html).toContain('<svg viewBox="0 0 780 400"')
  expect(html).toContain('<rect class="overflow" x="0" y="40" width="900" height="60"/>')
  expect(html).toContain('<rect class="blank" x="10" y="120" width="300" height="180"/>')
})
