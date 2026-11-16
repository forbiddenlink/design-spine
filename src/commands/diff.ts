import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { Command } from 'commander'
import { PNG } from 'pngjs'
import { ariaFileFor, structureDiff } from '../lib/aria.ts'
import { compareImages, ignoredBoxes } from '../lib/diff.ts'
import { evaluateGate } from '../lib/gate.ts'
import { sha256 } from '../lib/hash.ts'
import {
  baselinesDir,
  loadBaselineManifest,
  loadReview,
  loadRun,
  resolveRunDir,
  writeJson,
} from '../lib/runs.ts'
import { buildSummary } from '../lib/summary.ts'
import type { Provenance } from '../lib/types.ts'
import { guard, numberOption, root } from './shared.ts'

interface DiffOptions {
  run: string
  threshold: string
  pixelThreshold: string
  allowSubtle?: boolean
  strict?: boolean
  requireBaselines?: boolean
  summary?: string
}

export function registerDiff(program: Command): void {
  program
    .command('diff')
    .description('Compare a run to baselines; exit 1 when any tile exceeds the threshold')
    .option('--run <id>', 'run id or path', 'latest')
    .option('--threshold <ratio>', 'changed-pixel ratio', '0.002')
    .option(
      '--pixel-threshold <0-1>',
      'per-pixel color tolerance passed to pixelmatch; lower catches fainter changes',
      '0.1',
    )
    .option(
      '--allow-subtle',
      'report changes hidden by the per-pixel tolerance as "subtle" without failing',
    )
    .option(
      '--require-baselines',
      'fail when a captured tile has no baseline, without requiring a new review',
    )
    .option(
      '--strict',
      'also require complete coverage, human approval and compatible baseline provenance',
    )
    .option('--summary <file>', 'append a GitHub-flavoured Markdown summary to this file')
    .action(
      guard(async (o: DiffOptions) => {
        const threshold = numberOption(o.threshold, 'threshold', 0, 1, false)
        const pixelThreshold = numberOption(o.pixelThreshold, 'pixel-threshold', 0, 1, false)
        const dir = resolveRunDir(root, o.run)
        const run = loadRun(dir)
        const bdir = baselinesDir(root)
        mkdirSync(join(dir, 'diff'), { recursive: true })
        const baselineManifest = loadBaselineManifest<{
          provenance?: Provenance
          recipeHash?: string
          imageHash?: string
          masks?: import('../lib/types.ts').Box[]
        }>(join(bdir, 'manifest.json'))
        const rows: { id: string; result: string; ratio: string }[] = []
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
          if (r.diff && r.diffPixels > 0)
            writeFileSync(join(dir, 'diff', t.file), PNG.sync.write(r.diff))
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
        const w = Math.max(4, ...rows.map((r) => r.id.length))
        console.log(`${'tile'.padEnd(w)}  ${'result'.padEnd(12)}  ratio`)
        for (const r of rows) console.log(`${r.id.padEnd(w)}  ${r.result.padEnd(12)}  ${r.ratio}`)
        console.log(`\n${rows.length} tiles, ${failed} failed comparisons; threshold ${threshold}`)
        const subtle = rows.filter((r) => r.result === 'subtle').length
        if (subtle)
          console.warn(
            `${subtle} tiles changed below the per-pixel tolerance (${pixelThreshold}), such as a faint color shift. Inspect them in \`spine review\`.${o.allowSubtle ? ' --allow-subtle: not counted as failures.' : ' Pass --allow-subtle to report them without failing.'}`,
          )
        const fresh = rows.filter((r) => r.result === 'new').length
        if (fresh && !o.strict)
          console.warn(
            `${fresh} tiles have no baseline. Run \`spine approve\` after review. Use --require-baselines to fail on missing baselines, or --strict for complete sign-off.`,
          )
        const reasons = o.strict
          ? evaluateGate(
              run,
              loadReview(dir),
              rows,
              Object.fromEntries(
                Object.entries(baselineManifest?.tiles ?? {}).map(([id, entry]) => [id, entry]),
              ),
            )
          : []
        for (const reason of reasons) console.error(`gate: ${reason}`)
        if (reasons.length) failed++
        writeJson(join(dir, 'diff.json'), {
          threshold,
          pixelThreshold,
          rows,
          policy: o.strict ? 'strict' : o.requireBaselines ? 'require-baselines' : 'pixels',
          gateReasons: reasons,
        })
        if (o.summary)
          appendFileSync(
            resolve(root, o.summary),
            buildSummary({
              rows,
              threshold,
              policy: o.strict ? 'strict' : o.requireBaselines ? 'require-baselines' : 'pixels',
              gateReasons: reasons,
              failed,
            }),
          )
        process.exit(failed ? 1 : 0)
      }),
    )
}
