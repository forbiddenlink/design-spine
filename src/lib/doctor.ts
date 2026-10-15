import type { CoverageEntry } from './types.ts'

/** One line per route+state (or per tile with `verbose`), capped so a big app stays readable. */
export function unfinishedLines(coverage: CoverageEntry[], verbose = false, cap = 40): string[] {
  const skipped = coverage.filter((entry) => entry.outcome === 'skipped')
  let lines: string[]
  if (verbose) lines = skipped.map((entry) => `${entry.id}: ${entry.reason}`)
  else {
    const groups = new Map<string, { n: number; reason?: string }>()
    for (const e of skipped) {
      const key = `${e.route} · ${e.state}`
      const g = groups.get(key) ?? { n: 0, reason: e.reason }
      g.n++
      groups.set(key, g)
    }
    lines = [...groups].map(
      ([key, g]) => `${key} (${g.n} tile${g.n === 1 ? '' : 's'}): ${g.reason}`,
    )
  }
  if (verbose || lines.length <= cap) return lines
  return [...lines.slice(0, cap), `${lines.length - cap} more, use --verbose`]
}
