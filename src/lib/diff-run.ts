import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PNG } from 'pngjs'
import { ariaFileFor, structureDiff } from './aria.ts'
import { compareImages, ignoredBoxes } from './diff.ts'
import { evaluateGate } from './gate.ts'
import { sha256 } from './hash.ts'
import { baselinesDir, loadBaselineManifest, loadReview, loadRun } from './runs.ts'
import type { Box, Provenance } from './types.ts'

export interface DiffRow {
  id: string
  result: string
  ratio: string
}

export interface DiffRunOptions {
  root: string
  /** Run directory to compare. */
  dir: string
  threshold: number
  pixelThreshold: number
  allowSubtle?: boolean
  strict?: boolean
  requireBaselines?: boolean
}

export interface DiffRunResult {
  rows: DiffRow[]
  /** Tiles whose comparison failed; strict gate reasons are reported separately. */
  failedComparisons: number
  policy: 'strict' | 'require-baselines' | 'pixels'
  gateReasons: string[]
}

/**
 * Compare every tile of a run to its baseline. Writes diff images and structure diffs under
 * `<dir>/diff`; the caller decides what to print and how to exit.
 */
export async function diffRun(o: DiffRunOptions): Promise<DiffRunResult> {
  const { dir, threshold, pixelThreshold } = o
  const run = loadRun(dir)
  const bdir = baselinesDir(o.root)
  mkdirSync(join(dir, 'diff'), { recursive: true })
  const baselineManifest = loadBaselineManifest<{
    provenance?: Provenance
    recipeHash?: string
    imageHash?: string
    masks?: Box[]
  }>(join(bdir, 'manifest.json'))
  const rows: DiffRow[] = []
  let failed = 0
  for (const [index, t] of run.tiles.entries()) {
    if (index > 0 && index % 4 === 0) {
      // Allow decoded buffers to be released before the next image group.
      await new Promise<void>((resolve) => setImmediate(resolve))
      Bun.gc(true)
    }
    const bp = join(bdir, t.file)
    // Pixels can match while the accessible structure changed: a button that lost its label,
    // a heading that changed level. Compared only when this capture recorded a snapshot.
    const structureChanged = (): boolean => {
      const lines = structureDiff(bdir, dir, t)
      if (!lines.length) return false
      writeFileSync(
        join(dir, 'diff', ariaFileFor(t.file).replace(/\.yml$/, '.diff')),
        `${lines.join('\n')}\n`,
      )
      return true
    }
    if (t.error || !existsSync(join(dir, t.file))) {
      rows.push({ id: t.id, result: 'no-capture', ratio: '-' })
      failed++
      continue
    }
    const current = readFileSync(join(dir, t.file))
    const currentHash = sha256(current)
    if (o.strict && (!t.imageHash || currentHash !== t.imageHash)) {
      rows.push({ id: t.id, result: 'modified-capture', ratio: '-' })
      failed++
      continue
    }
    if (!existsSync(bp)) {
      rows.push({ id: t.id, result: 'new', ratio: '-' })
      if (o.requireBaselines) failed++
      continue
    }
    const baseline = readFileSync(bp)
    const baselineHash = sha256(baseline)
    const pinned = baselineManifest?.tiles[t.id]?.imageHash
    if (o.strict && pinned && baselineHash !== pinned) {
      rows.push({ id: t.id, result: 'modified-baseline', ratio: '-' })
      failed++
      continue
    }
    // Byte-identical files cannot differ in any pixel; skip decoding both PNGs.
    if (currentHash === baselineHash) {
      const changed = structureChanged()
      if (changed) failed++
      rows.push({
        id: t.id,
        result: changed ? 'structure-changed' : 'ok',
        ratio: (0).toFixed(5),
      })
      continue
    }
    let r: ReturnType<typeof compareImages>
    try {
      r = compareImages(
        PNG.sync.read(baseline),
        PNG.sync.read(current),
        threshold,
        pixelThreshold,
        ignoredBoxes(t, baselineManifest?.tiles[t.id]?.masks),
        false,
      )
    } catch {
      rows.push({ id: t.id, result: 'unreadable', ratio: '-' })
      failed++
      continue
    }
    // Encoding is the slow part; unchanged tiles have nothing to show.
    if (r.diff && r.diffPixels > 0) writeFileSync(join(dir, 'diff', t.file), PNG.sync.write(r.diff))
    if (r.exceeds || (r.subtle && !o.allowSubtle)) failed++
    const pixels = r.sizeMismatch
      ? 'size-changed'
      : r.exceeds
        ? 'CHANGED'
        : r.subtle
          ? 'subtle'
          : 'ok'
    const structure = pixels === 'ok' && structureChanged()
    if (structure) failed++
    rows.push({
      id: t.id,
      result: structure ? 'structure-changed' : pixels,
      ratio: r.sizeMismatch ? '-' : (r.subtle ? (r.exactRatio ?? 0) : r.ratio).toFixed(5),
    })
  }
  const gateReasons = o.strict
    ? evaluateGate(run, loadReview(dir), rows, { ...(baselineManifest?.tiles ?? {}) })
    : []
  return {
    rows,
    failedComparisons: failed,
    policy: o.strict ? 'strict' : o.requireBaselines ? 'require-baselines' : 'pixels',
    gateReasons,
  }
}
