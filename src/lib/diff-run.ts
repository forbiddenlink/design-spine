import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PNG } from 'pngjs'
import { ariaFileFor, ariaIntact, structureDiff } from './aria.ts'
import {
  changedBounds,
  compareImages,
  exactChangedBounds,
  ignoredBoxes,
  largestChangedRegion,
} from './diff.ts'
import { evaluateGate } from './gate.ts'
import { sha256 } from './hash.ts'
import { baselinesDir, loadBaselineManifest, loadReview, loadRun } from './runs.ts'
import type { Box, Provenance } from './types.ts'

export interface DiffRow {
  id: string
  result: string
  ratio: string
  /** Absolute path of the diff image; only for tiles with changed pixels. */
  diffImage?: string
  /** Bounding box of the changed pixels; only for CHANGED and subtle tiles. */
  box?: Box
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
  /** Fail a tile whose largest changed cluster holds more pixels than this, whatever the ratio. */
  maxRegionPixels?: number
}

export interface DiffRunResult {
  rows: DiffRow[]
  /** Tiles whose comparison failed; strict gate reasons are reported separately. */
  failedComparisons: number
  policy: 'strict' | 'require-baselines' | 'pixels'
  gateReasons: string[]
  /** Approved baselines with no screen in this run: a route or state was removed or renamed. */
  orphans: string[]
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
    ariaHash?: string
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
    if (
      o.strict &&
      (!t.imageHash || currentHash !== t.imageHash || !ariaIntact(dir, t.file, t.ariaHash))
    ) {
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
    if (
      o.strict &&
      pinned &&
      (baselineHash !== pinned ||
        !ariaIntact(bdir, t.file, baselineManifest?.tiles[t.id]?.ariaHash))
    ) {
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
    let baselinePng: PNG
    let currentPng: PNG
    try {
      baselinePng = PNG.sync.read(baseline)
      currentPng = PNG.sync.read(current)
      r = compareImages(
        baselinePng,
        currentPng,
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
    const diffImage = join(dir, 'diff', t.file)
    const wroteDiff = !!r.diff && r.diffPixels > 0
    if (r.diff && wroteDiff) writeFileSync(diffImage, PNG.sync.write(r.diff))
    const regionTooLarge =
      o.maxRegionPixels !== undefined &&
      !r.exceeds &&
      !!r.diff &&
      r.diffPixels > o.maxRegionPixels &&
      largestChangedRegion(r.diff) > o.maxRegionPixels
    if (r.exceeds || regionTooLarge || (r.subtle && !o.allowSubtle)) failed++
    const pixels = r.sizeMismatch
      ? 'size-changed'
      : r.exceeds || regionTooLarge
        ? 'CHANGED'
        : r.subtle
          ? 'subtle'
          : 'ok'
    const structure =
      (pixels === 'ok' || (pixels === 'subtle' && o.allowSubtle)) && structureChanged()
    if (structure) failed++
    // A subtle change leaves the perceptual diff empty, so its box comes from the exact bytes.
    const box =
      pixels === 'CHANGED' && r.diff
        ? changedBounds(r.diff)
        : pixels === 'subtle'
          ? exactChangedBounds(baselinePng, currentPng)
          : null
    rows.push({
      id: t.id,
      result: structure ? 'structure-changed' : pixels,
      ratio: r.sizeMismatch ? '-' : (r.subtle ? (r.exactRatio ?? 0) : r.ratio).toFixed(5),
      ...(wroteDiff ? { diffImage } : {}),
      ...(box ? { box } : {}),
    })
  }
  // Coverage lists filtered and excluded screens too, so only a screen the manifest no longer
  // plans counts as gone. Older runs without coverage fall back to their tiles.
  const planned = new Set([
    ...run.tiles.map((t) => t.id),
    ...(run.coverage ?? []).map((entry) => entry.id),
  ])
  const orphans = Object.keys(baselineManifest?.tiles ?? {}).filter((id) => !planned.has(id))
  const gateReasons = o.strict
    ? [
        ...evaluateGate(run, loadReview(dir), rows, { ...(baselineManifest?.tiles ?? {}) }),
        ...orphans.map(
          (id) =>
            `${id}: approved baseline has no screen in this run; remove it from the baselines or restore the route or state`,
        ),
      ]
    : []
  return {
    rows,
    failedComparisons: failed,
    policy: o.strict ? 'strict' : o.requireBaselines ? 'require-baselines' : 'pixels',
    gateReasons,
    orphans,
  }
}
