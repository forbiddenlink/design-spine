import type { Decision, ReviewEntry, ReviewFile } from './types.ts'

export interface ReviewPatch {
  tileId: string
  decision?: Decision | null
  note?: string
  anchor?: ReviewEntry['anchor'] | null
}

/** Pure merge: only the fields present in the patch change. */
export function mergeReview(
  existing: ReviewFile | null | undefined,
  patch: ReviewPatch,
  now = new Date().toISOString(),
): ReviewFile {
  const tiles = { ...(existing?.tiles ?? {}) }
  const prev: ReviewEntry = tiles[patch.tileId] ?? { decision: null, note: '', updatedAt: now }
  const anchor = patch.anchor === undefined ? prev.anchor : patch.anchor
  tiles[patch.tileId] = {
    decision: patch.decision === undefined ? prev.decision : patch.decision,
    note: patch.note === undefined ? prev.note : patch.note,
    updatedAt: now,
    ...(anchor ? { anchor } : {}),
  }
  return { tiles }
}
