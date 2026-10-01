import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { CritiqueEntry, CritiqueIssue } from './types.ts'

const MODEL_RE = /^(sonnet|opus|haiku|fable|claude-[\w.-]+)$/

/** Critique only ever goes to Claude models. */
export function assertClaudeModel(model: string): void {
  if (!MODEL_RE.test(model)) {
    throw new Error(`Model "${model}" is not a Claude model. Critique only runs on Claude.`)
  }
}

function tryParse(s: string): unknown {
  try {
    return JSON.parse(s)
  } catch {
    return undefined
  }
}

function candidates(text: string): string[] {
  const out: string[] = []
  for (const m of text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) out.push((m[1] as string).trim())
  // First balanced {...} block, string-aware.
  const start = text.indexOf('{')
  if (start >= 0) {
    let depth = 0
    let inStr = false
    let esc = false
    for (let i = start; i < text.length; i++) {
      const c = text[i] as string
      if (inStr) {
        if (esc) esc = false
        else if (c === '\\') esc = true
        else if (c === '"') inStr = false
      } else if (c === '"') inStr = true
      else if (c === '{') depth++
      else if (c === '}' && --depth === 0) {
        out.push(text.slice(start, i + 1))
        break
      }
    }
  }
  out.push(text.trim())
  return out
}

function normalize(v: unknown): CritiqueEntry | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  if (o.verdict !== 'pass' && o.verdict !== 'fix') return null
  const issues: CritiqueIssue[] = Array.isArray(o.issues)
    ? o.issues
        .filter((i): i is Record<string, unknown> => !!i && typeof i === 'object')
        .map((i) => ({
          severity: String(i.severity ?? 'minor'),
          what: String(i.what ?? ''),
          where: String(i.where ?? ''),
        }))
    : []
  return { verdict: o.verdict, issues }
}

/** Tolerates code fences or prose around the JSON. Returns null when nothing valid is found. */
export function parseCritique(text: string): CritiqueEntry | null {
  for (const c of candidates(text)) {
    const r = normalize(tryParse(c))
    if (r) return r
  }
  return null
}

export function extractThemeBlock(css: string): string | null {
  const start = css.search(/@theme\b[^{]*\{/)
  if (start < 0) return null
  const open = css.indexOf('{', start)
  let depth = 0
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++
    else if (css[i] === '}' && --depth === 0) return css.slice(start, i + 1)
  }
  return css.slice(start)
}

export function collectDesignRules(root: string, maxChars = 6000): string {
  const parts: string[] = []
  for (const f of ['DESIGN.md', '.impeccable.md', 'public/design-system.txt']) {
    const p = join(root, f)
    if (existsSync(p)) parts.push(`## ${f}\n${readFileSync(p, 'utf8').trim()}`)
  }
  for (const f of ['app/globals.css', 'src/app/globals.css']) {
    const p = join(root, f)
    if (!existsSync(p)) continue
    const block = extractThemeBlock(readFileSync(p, 'utf8'))
    if (block) {
      parts.push(`## @theme (${f})\n${block}`)
      break
    }
  }
  const all = parts.join('\n\n')
  return all.length > maxChars ? `${all.slice(0, maxChars)}\n[truncated]` : all
}

export function buildPrompt(rules: string, imagePath: string, meta: string): string {
  return [
    'You are a strict product design reviewer. Review one screenshot of a web UI.',
    `First, use the Read tool to view this image file: ${imagePath}`,
    `Screenshot context: ${meta}`,
    rules
      ? `Design rules for this repo:\n${rules}`
      : 'No repo design rules were found; judge on general craft.',
    'Look for: empty or placeholder boxes, broken or missing images, clipped or overlapping text, horizontal overflow, low contrast, misaligned spacing, inconsistent type scale, and violations of the rules above.',
    'Reply with ONLY strict JSON, no prose, no code fences:',
    '{"verdict":"pass"|"fix","issues":[{"severity":"high"|"medium"|"low","what":"...","where":"..."}]}',
    'Use verdict "pass" with an empty issues array when nothing is wrong.',
  ].join('\n\n')
}
