import { describe, expect, it } from 'vitest'
import { assertClaudeModel, extractThemeBlock, parseCritique } from '../src/lib/critique.ts'

const json =
  '{"verdict":"fix","issues":[{"severity":"high","what":"Empty card","where":"grid, 3rd card"}]}'

describe('parseCritique', () => {
  it('parses bare JSON', () => {
    expect(parseCritique(json)?.verdict).toBe('fix')
  })
  it('parses JSON inside a code fence', () => {
    const r = parseCritique(`Here you go:\n\`\`\`json\n${json}\n\`\`\`\nDone.`)
    expect(r?.issues[0]).toEqual({ severity: 'high', what: 'Empty card', where: 'grid, 3rd card' })
  })
  it('parses JSON surrounded by prose, with braces inside strings', () => {
    const r = parseCritique(
      'Verdict follows. {"verdict":"pass","issues":[]} Hope that helps {sic}.',
    )
    expect(r).toEqual({ verdict: 'pass', issues: [] })
    const tricky = parseCritique(
      '{"verdict":"fix","issues":[{"severity":"low","what":"uses } brace","where":"x"}]}',
    )
    expect(tricky?.issues[0]?.what).toBe('uses } brace')
  })
  it('returns null for garbage or an invalid verdict', () => {
    expect(parseCritique('no json here')).toBeNull()
    expect(parseCritique('{"verdict":"maybe","issues":[]}')).toBeNull()
  })
  it('defaults missing issues to an empty list', () => {
    expect(parseCritique('{"verdict":"pass"}')?.issues).toEqual([])
  })
})

describe('guards and helpers', () => {
  it('only allows Claude models', () => {
    expect(() => assertClaudeModel('sonnet')).not.toThrow()
    expect(() => assertClaudeModel('claude-sonnet-5-5')).not.toThrow()
    expect(() => assertClaudeModel('gpt-5.6')).toThrow(/not a Claude model/)
    expect(() => assertClaudeModel('gemini-3')).toThrow()
  })
  it('extracts a balanced @theme block', () => {
    const css =
      '@import "tailwindcss";\n@theme inline {\n  --color-a: red;\n  --x: { y };\n}\nbody{}'
    expect(extractThemeBlock(css)).toBe('@theme inline {\n  --color-a: red;\n  --x: { y };\n}')
    expect(extractThemeBlock('body{}')).toBeNull()
  })
})
