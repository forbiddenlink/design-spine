import { describe, expect, it } from 'vitest'
import { buildSummary, escapeMarkdown, SUMMARY_MARKER } from '../src/lib/summary.ts'

const base = { threshold: 0.002, policy: 'pixels', gateReasons: [], failed: 0 }

describe('escapeMarkdown', () => {
  it('escapes pipes, angle brackets, backticks, backslashes and ampersands', () => {
    expect(escapeMarkdown('a|b<img src=x>`c`\\d&e')).toBe(
      'a\\|b&lt;img src=x&gt;\\`c\\`\\\\d&amp;e',
    )
  })
  it('collapses newlines so a value cannot break a table row', () => {
    expect(escapeMarkdown('a\n| x |\r\nb')).toBe('a \\| x \\| b')
  })
})

describe('buildSummary', () => {
  it('reports a pass with no table when every tile is ok', () => {
    const out = buildSummary({ ...base, rows: [{ id: 'home', result: 'ok', ratio: '0.00000' }] })
    expect(out.startsWith(SUMMARY_MARKER)).toBe(true)
    expect(out).toContain('## Design Spine: passed')
    expect(out).toContain('1 tiles (1 ok)')
    expect(out).not.toContain('| Tile |')
  })

  it('lists only non-ok tiles and counts every result kind', () => {
    const rows = [
      { id: 'a', result: 'ok', ratio: '0.00000' },
      { id: 'b', result: 'CHANGED', ratio: '0.05000' },
      { id: 'c', result: 'new', ratio: '-' },
      { id: 'd', result: 'size-changed', ratio: '-' },
      { id: 'e', result: 'no-capture', ratio: '-' },
      { id: 'f', result: 'modified-capture', ratio: '-' },
      { id: 'g', result: 'modified-baseline', ratio: '-' },
      { id: 'h', result: 'unreadable', ratio: '-' },
    ]
    const out = buildSummary({ ...base, rows, failed: 6 })
    expect(out).toContain('## Design Spine: failed')
    expect(out).toContain(
      '8 tiles (1 ok, 1 CHANGED, 1 new, 1 size-changed, 1 no-capture, 1 modified-capture, 1 modified-baseline, 1 unreadable)',
    )
    expect(out).toContain('| b | CHANGED | 0.05000 |')
    expect(out).not.toContain('| a |')
  })

  it('escapes hostile ids and gate reasons', () => {
    const out = buildSummary({
      ...base,
      failed: 1,
      gateReasons: ['<script>alert(1)</script> | x'],
      rows: [{ id: '<img onerror=x>|`', result: 'CHANGED', ratio: '0.1' }],
    })
    expect(out).not.toContain('<img')
    expect(out).not.toContain('<script>')
    expect(out).toContain('&lt;img onerror=x&gt;\\|\\`')
    expect(out).toContain('- &lt;script&gt;alert(1)&lt;/script&gt; \\| x')
  })

  it('caps the table at 50 rows and says how many were left out', () => {
    const rows = Array.from({ length: 53 }, (_, i) => ({
      id: `t${i}`,
      result: 'CHANGED',
      ratio: '0.1',
    }))
    const out = buildSummary({ ...base, rows, failed: 53 })
    expect(out.match(/^\| t\d+ /gm)).toHaveLength(50)
    expect(out).toContain('and 3 more')
  })

  it('points reviewers at the report artifact', () => {
    expect(buildSummary({ ...base, rows: [] })).toContain('`design-spine-report` artifact')
  })
})
