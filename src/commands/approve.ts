import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Command } from 'commander'
import { ariaFileFor } from '../lib/aria.ts'
import { sha256 } from '../lib/hash.ts'
import {
  baselinesDir,
  flagReasons,
  loadBaselineManifest,
  loadReview,
  loadRun,
  resolveRunDir,
  writeJson,
} from '../lib/runs.ts'
import { guard, root } from './shared.ts'

export function registerApprove(program: Command): void {
  program
    .command('approve')
    .description('Copy approved tiles into baselines')
    .option('--run <id>', 'run id or path', 'latest')
    .option('--dry-run', 'list the tiles that would be promoted without writing')
    .action(
      guard((o: { run: string; dryRun?: boolean }) => {
        const dir = resolveRunDir(root, o.run)
        const run = loadRun(dir)
        const review = loadReview(dir)
        const bdir = baselinesDir(root)
        const manifestPath = join(bdir, 'manifest.json')
        const manifest = loadBaselineManifest(manifestPath)
        const selected = run.tiles
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
        if (o.dryRun) {
          for (const { tile } of selected)
            console.log(
              `${existsSync(join(bdir, tile.file)) ? 'replace' : 'add'} ${tile.id} (${tile.file})`,
            )
          console.log(`Dry run: ${selected.length} tiles would be promoted into ${bdir}`)
          return
        }
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
            findings: flagReasons(t),
            ...(t.ariaHash ? { ariaHash: t.ariaHash } : {}),
          }
          n++
        }
        writeJson(manifestPath, { updatedAt: new Date().toISOString(), tiles: manifest.tiles })
        console.log(`Approved ${n} tiles into ${bdir}`)
      }),
    )
}
