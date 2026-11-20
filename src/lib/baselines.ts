import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ariaFileFor } from './aria.ts'
import { sha256 } from './hash.ts'
import { baselineFindings, baselinesDir, writeJson } from './runs.ts'
import type { ReviewFile, RunRecord, Tile } from './types.ts'

export interface Promotion {
  tile: Tile
  bytes: Buffer
  aria: Buffer | null
}

/**
 * The approved tiles of a run with their screenshot and structure bytes, each checked against the
 * hash recorded at capture. Throws on the first tile that cannot be promoted, so a batch is all or
 * nothing.
 */
export function selectApproved(dir: string, run: RunRecord, review: ReviewFile): Promotion[] {
  return run.tiles
    .filter((tile) => review.tiles[tile.id]?.decision === 'approve')
    .map((tile) => {
      if (tile.error) throw new Error(`${tile.id}: failed captures cannot become baselines.`)
      const bytes = readFileSync(join(dir, tile.file))
      if (tile.imageHash && sha256(bytes) !== tile.imageHash)
        throw new Error(
          `${tile.id}: screenshot changed after capture; recapture and review before promotion.`,
        )
      // The structure snapshot is promoted with its screenshot, under the same integrity check.
      let aria: Buffer | null = null
      if (tile.ariaHash) {
        aria = readFileSync(join(dir, ariaFileFor(tile.file)))
        if (sha256(aria) !== tile.ariaHash)
          throw new Error(
            `${tile.id}: structure snapshot changed after capture; recapture and review before promotion.`,
          )
      }
      return { tile, bytes, aria }
    })
}

export const baselineManifestPath = (root: string): string =>
  join(baselinesDir(root), 'manifest.json')

/**
 * Copy selected tiles into the baselines directory and record them in `manifest`, which the
 * caller loaded first so a corrupt manifest fails before any tile is read.
 */
export function promoteBaselines(
  root: string,
  run: RunRecord,
  selected: Promotion[],
  manifest: { tiles: Record<string, unknown> },
): number {
  const bdir = baselinesDir(root)
  mkdirSync(bdir, { recursive: true })
  let n = 0
  for (const { tile: t, bytes, aria } of selected) {
    // tmp + rename so a crash never leaves a half-written baseline.
    const target = join(bdir, t.file)
    const tmp = `${target}.${process.pid}.tmp`
    writeFileSync(tmp, bytes)
    renameSync(tmp, target)
    // A baseline promoted without a snapshot must not be compared against an older one.
    const ariaTarget = join(bdir, ariaFileFor(t.file))
    if (aria) {
      writeFileSync(`${ariaTarget}.${process.pid}.tmp`, aria)
      renameSync(`${ariaTarget}.${process.pid}.tmp`, ariaTarget)
    } else rmSync(ariaTarget, { force: true })
    manifest.tiles[t.id] = {
      file: t.file,
      imageHash: sha256(bytes),
      run: run.id,
      approvedAt: new Date().toISOString(),
      provenance: run.provenance,
      recipeHash: t.recipeHash,
      masks: t.masks?.flatMap((mask) => mask.boxes),
      // The gate re-asks for review when these change under identical pixels.
      findings: baselineFindings(t),
      ...(t.ariaHash ? { ariaHash: t.ariaHash } : {}),
    }
    n++
  }
  writeJson(baselineManifestPath(root), {
    updatedAt: new Date().toISOString(),
    tiles: manifest.tiles,
  })
  return n
}
