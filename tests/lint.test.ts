import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  canUpdateBaseline,
  countArbitrary,
  defaultScanDir,
  evaluateRatchet,
  isExcluded,
  newOffenders,
} from '../src/lib/lint.ts'

describe('countArbitrary', () => {
  it('counts px/rem, hex and color-function values once each', () => {
    const src = [
      '<div className="p-[13px] mt-[1.5rem] bg-[#fff] text-[#1a2b3c]">',
      '<i className="border-[rgb(1,2,3)] fill-[oklch(0.5_0.1_20)] stroke-[hsl(1,2%,3%)]" />',
    ].join('\n')
    const m = countArbitrary(src, 'a.tsx')
    expect(m.map((x) => x.text)).toEqual([
      '-[13px]',
      '-[1.5rem]',
      '[#fff]',
      '[#1a2b3c]',
      'border-[rgb',
      'fill-[oklch',
      'stroke-[hsl',
    ])
    expect(m[0]).toMatchObject({ file: 'a.tsx', line: 1, col: 18 })
    expect(m[4]?.line).toBe(2)
  })
  it('ignores tokens and non-arbitrary values', () => {
    expect(
      countArbitrary('<div className="p-4 bg-primary w-[calc(100%-2rem)] text-[var(--x)]" />'),
    ).toEqual([])
  })
})

describe('exclusions', () => {
  it('skips opengraph-image, email and icon files', () => {
    expect(isExcluded('app/opengraph-image.tsx')).toBe(true)
    expect(isExcluded('app/blog/opengraph-image-2.tsx')).toBe(true)
    expect(isExcluded('lib/welcome-email.tsx')).toBe(true)
    expect(isExcluded('app/icon.tsx')).toBe(true)
    expect(isExcluded('app/page.tsx')).toBe(false)
    expect(isExcluded('components/Iconography.tsx')).toBe(false)
  })
})

describe('ratchet', () => {
  it('fails only when the count rose', () => {
    expect(evaluateRatchet(5, 5)).toEqual({ ok: true, delta: 0 })
    expect(evaluateRatchet(4, 5)).toEqual({ ok: true, delta: -1 })
    expect(evaluateRatchet(7, 5)).toEqual({ ok: false, delta: 2 })
    expect(evaluateRatchet(9, null).ok).toBe(true)
  })
  it('refuses to raise the baseline without force', () => {
    expect(canUpdateBaseline(7, 5, false)).toBe(false)
    expect(canUpdateBaseline(7, 5, true)).toBe(true)
    expect(canUpdateBaseline(3, 5, false)).toBe(true)
    expect(canUpdateBaseline(3, null, false)).toBe(true)
  })
  it('reports new offenders per file', () => {
    const mk = (file: string, line: number) => ({ file, line, col: 1, text: 'x' })
    const matches = [mk('a.tsx', 1), mk('a.tsx', 9), mk('b.tsx', 3)]
    const out = newOffenders(matches, { 'a.tsx': 1 })
    expect(out.map((m) => `${m.file}:${m.line}`)).toEqual(['a.tsx:9', 'b.tsx:3'])
  })
})

it('allows only the next line with a written explanation and exposes its reason', () => {
  const source =
    '// spine-allow-next-line: Match the third-party embed dimensions\nconst a = "h-[313px]"\nconst b = "p-[13px]"\n// spine-allow-next-line:\nconst c = "m-[17px]"'
  expect(countArbitrary(source).map((match) => match.line)).toEqual([3, 5])
  expect(countArbitrary(source, '', true)).toMatchObject([
    { line: 2, reason: 'Match the third-party embed dimensions' },
  ])
})

describe('defaultScanDir', () => {
  it('prefers src, then a root app dir, then the repo root', () => {
    const root = mkdtempSync(join(tmpdir(), 'spine-lintdir-'))
    expect(defaultScanDir(root)).toBe('.')
    mkdirSync(join(root, 'app'))
    expect(defaultScanDir(root)).toBe('app')
    mkdirSync(join(root, 'src'))
    expect(defaultScanDir(root)).toBe('src')
  })
})
