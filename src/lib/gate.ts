import type { Provenance, ReviewFile, RunRecord } from './types.ts'

export function compatibleProvenance(a?: Provenance, b?: Provenance): boolean {
  return (
    !!a &&
    !!b &&
    a.browser === b.browser &&
    a.runtime === b.runtime &&
    a.platform === b.platform &&
    JSON.stringify(Object.entries(a.policy).sort()) ===
      JSON.stringify(Object.entries(b.policy).sort())
  )
}

/** Strict sign-off is separate from the backwards-compatible pixel-only diff. */
export function evaluateGate(
  run: RunRecord,
  review: ReviewFile,
  rows: { id: string; result: string }[],
  baselines: Record<string, { provenance?: Provenance; recipeHash?: string } | undefined> = {},
): string[] {
  const reasons: string[] = []
  if (!run.coverage?.length) reasons.push('Coverage unknown; recapture with this version.')
  if (!run.provenance) reasons.push('Capture provenance unknown; recapture with this version.')
  if (!run.tiles.length) reasons.push('No captured evidence.')
  const tiles = new Map(run.tiles.map((tile) => [tile.id, tile]))
  const comparisons = new Map(rows.map((row) => [row.id, row.result]))
  for (const entry of run.coverage ?? []) {
    if (
      entry.outcome === 'excluded' &&
      entry.exclusionSource === 'manifest' &&
      entry.reason?.trim()
    )
      continue
    if (entry.outcome !== 'captured' || !tiles.has(entry.id)) {
      reasons.push(`${entry.id}: incomplete coverage (${entry.outcome})`)
    }
  }
  for (const tile of run.tiles) {
    if (!run.coverage?.some((entry) => entry.id === tile.id && entry.outcome === 'captured')) {
      reasons.push(`${tile.id}: capture not represented in completed coverage`)
    }
    if (tile.error) reasons.push(`${tile.id}: capture failed`)
    if (
      run.provenance?.policy.accessibility &&
      (!tile.accessibility || tile.accessibility.error || tile.accessibility.violations.length)
    )
      reasons.push(`${tile.id}: accessibility findings or incomplete scan`)
    if (tile.stability === 'unstable') reasons.push(`${tile.id}: unstable capture`)
    const decision = review.tiles[tile.id]?.decision
    if (decision !== 'approve')
      reasons.push(`${tile.id}: ${decision === 'reject' ? 'rejected' : 'pending review'}`)
    const result = comparisons.get(tile.id)
    if (result !== 'ok') reasons.push(`${tile.id}: ${result ?? 'comparison missing'}`)
    if (!tile.recipeHash || tile.recipeHash !== baselines[tile.id]?.recipeHash)
      reasons.push(`${tile.id}: capture recipe unknown or differs from baseline`)
    if (!compatibleProvenance(run.provenance, baselines[tile.id]?.provenance)) {
      reasons.push(`${tile.id}: baseline provenance unknown or incompatible`)
    }
  }
  return reasons
}
