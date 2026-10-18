export const SUMMARY_MARKER = '<!-- design-spine -->'
export const SUMMARY_ROW_CAP = 50

export interface SummaryInput {
  rows: { id: string; result: string; ratio: string }[]
  threshold: number
  policy: string
  gateReasons: string[]
  /** Number of failures the CLI counted; it decides pass or fail. */
  failed: number
  /** Where reviewers find the full report. */
  reportArtifact?: string
}

const RESULTS = [
  'ok',
  'CHANGED',
  'new',
  'size-changed',
  'no-capture',
  'modified-capture',
  'modified-baseline',
  'unreadable',
]

/** Ids and reasons come from user manifests, so neutralise Markdown and HTML. */
export function escapeMarkdown(text: string): string {
  return text
    .replace(/[\r\n]+/g, ' ')
    .replace(/[&\\|<>`]/g, (c) =>
      c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : `\\${c}`,
    )
}

export function buildSummary(input: SummaryInput): string {
  const { rows, failed } = input
  const counts = new Map<string, number>()
  for (const r of rows) counts.set(r.result, (counts.get(r.result) ?? 0) + 1)
  const kinds = [...RESULTS, ...[...counts.keys()].filter((k) => !RESULTS.includes(k))]
  const parts = kinds
    .filter((k) => (counts.get(k) ?? 0) > 0 || k === 'ok')
    .map((k) => `${counts.get(k) ?? 0} ${escapeMarkdown(k)}`)
  const lines = [
    SUMMARY_MARKER,
    `## Design Spine: ${failed ? 'failed' : 'passed'}`,
    '',
    `${rows.length} tiles (${parts.join(', ')}). Policy: ${escapeMarkdown(input.policy)}, threshold ${input.threshold}.`,
    '',
  ]
  const shown = rows.filter((r) => r.result !== 'ok')
  if (shown.length) {
    lines.push('| Tile | Result | Ratio |', '| --- | --- | --- |')
    for (const r of shown.slice(0, SUMMARY_ROW_CAP))
      lines.push(
        `| ${escapeMarkdown(r.id)} | ${escapeMarkdown(r.result)} | ${escapeMarkdown(r.ratio)} |`,
      )
    if (shown.length > SUMMARY_ROW_CAP) lines.push('', `and ${shown.length - SUMMARY_ROW_CAP} more`)
    lines.push('')
  }
  if (input.gateReasons.length) {
    lines.push('Strict gate reasons:', '')
    for (const reason of input.gateReasons) lines.push(`- ${escapeMarkdown(reason)}`)
    lines.push('')
  }
  lines.push(
    `Full report with screenshots: download the \`${input.reportArtifact ?? 'design-spine-report'}\` artifact from this run.`,
    '',
  )
  return lines.join('\n')
}
