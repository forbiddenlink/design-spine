import { existsSync, lstatSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

/** Default scan dir: `src` if present, else a root `app`, else the repo root. */
export function defaultScanDir(root: string): string {
  return ['src', 'app'].find((d) => existsSync(join(root, d))) ?? '.'
}

export interface LintMatch {
  file: string
  line: number
  col: number
  text: string
  reason?: string
}

// One alternation so overlapping patterns cannot count the same class twice.
const ARBITRARY_RE =
  /(?:(?:bg|text|border|fill|stroke)-\[(?:rgb|hsl|oklch))|(?:-\[[0-9.]+(?:px|rem)\])|(?:\[#[0-9a-fA-F]{3,8}\])/g

const EXCLUDES: RegExp[] = [
  /(^|\/)opengraph-image[^/]*$/,
  /(^|\/)[^/]*email[^/]*$/,
  /(^|\/)icon[^/]*$/,
]

export const isExcluded = (relPath: string): boolean =>
  EXCLUDES.some((re) => re.test(relPath.replaceAll('\\', '/')))

export function countArbitrary(content: string, file = '', exceptionsOnly = false): LintMatch[] {
  const out: LintMatch[] = []
  const lines = content.split('\n')
  lines.forEach((line, i) => {
    const reason = lines[i - 1]
      ?.match(/^\s*(?:\/\/|\{\/\*)\s*spine-allow-next-line:\s*(.*?)\s*(?:\*\/\})?$/)?.[1]
      ?.trim()
    if (exceptionsOnly ? !reason : reason) return
    for (const m of line.matchAll(ARBITRARY_RE)) {
      out.push({
        file,
        line: i + 1,
        col: (m.index ?? 0) + 1,
        text: m[0],
        ...(reason ? { reason } : {}),
      })
    }
  })
  return out
}

const SKIP_DIRS = new Set([
  'node_modules',
  '.next',
  '.git',
  '.design-spine',
  'dist',
  'build',
  'coverage',
])

/** True when a symlink resolves to a regular file; dangling links and linked dirs are false. */
function isLinkedFile(path: string): boolean {
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}

export function scanDir(dir: string, exceptionsOnly = false): LintMatch[] {
  const out: LintMatch[] = []
  const walk = (d: string): void => {
    for (const e of readdirSync(d).sort()) {
      const full = join(d, e)
      const st = lstatSync(full)
      // A symlinked directory can point back into this tree and loop forever.
      if (st.isSymbolicLink() && !isLinkedFile(full)) continue
      if (st.isDirectory()) {
        if (!SKIP_DIRS.has(e)) walk(full)
      } else if (/\.(tsx|jsx|ts)$/.test(e)) {
        const rel = relative(dir, full)
        if (isExcluded(rel)) continue
        out.push(...countArbitrary(readFileSync(full, 'utf8'), rel, exceptionsOnly))
      }
    }
  }
  walk(dir)
  return out
}

export interface LintBaseline {
  count: number
  files: Record<string, number>
  updatedAt: string
}

export function byFile(matches: LintMatch[]): Record<string, number> {
  const r: Record<string, number> = {}
  for (const m of matches) r[m.file] = (r[m.file] ?? 0) + 1
  return r
}

export function evaluateRatchet(
  count: number,
  baseline: number | null,
): { ok: boolean; delta: number } {
  if (baseline === null) return { ok: true, delta: 0 }
  return { ok: count <= baseline, delta: count - baseline }
}

/** Refuse to lower the guard by raising the baseline unless forced. */
export function canUpdateBaseline(count: number, baseline: number | null, force: boolean): boolean {
  return force || baseline === null || count <= baseline
}

/** Matches in files whose count rose above the baseline; the last (n - k) matches per file. */
export function newOffenders(
  matches: LintMatch[],
  baselineFiles: Record<string, number>,
): LintMatch[] {
  const grouped = new Map<string, LintMatch[]>()
  for (const m of matches) grouped.set(m.file, [...(grouped.get(m.file) ?? []), m])
  const out: LintMatch[] = []
  for (const [file, list] of grouped) {
    const extra = list.length - (baselineFiles[file] ?? 0)
    if (extra > 0) out.push(...list.slice(-extra))
  }
  return out
}
