import { appendFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { Command } from 'commander'
import { diffRun } from '../lib/diff-run.ts'
import { resolveRunDir, writeJson } from '../lib/runs.ts'
import { buildSummary } from '../lib/summary.ts'
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
        const {
          rows,
          failedComparisons,
          policy,
          gateReasons: reasons,
        } = await diffRun({
          root,
          dir,
          threshold,
          pixelThreshold,
          allowSubtle: o.allowSubtle,
          strict: o.strict,
          requireBaselines: o.requireBaselines,
        })
        const w = Math.max(4, ...rows.map((r) => r.id.length))
        console.log(`${'tile'.padEnd(w)}  ${'result'.padEnd(12)}  ratio`)
        for (const r of rows) console.log(`${r.id.padEnd(w)}  ${r.result.padEnd(12)}  ${r.ratio}`)
        console.log(
          `\n${rows.length} tiles, ${failedComparisons} failed comparisons; threshold ${threshold}`,
        )
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
        for (const reason of reasons) console.error(`gate: ${reason}`)
        const failed = failedComparisons + (reasons.length ? 1 : 0)
        writeJson(join(dir, 'diff.json'), {
          threshold,
          pixelThreshold,
          rows,
          policy,
          gateReasons: reasons,
        })
        if (o.summary)
          appendFileSync(
            resolve(root, o.summary),
            buildSummary({
              rows,
              threshold,
              policy,
              gateReasons: reasons,
              failed,
            }),
          )
        process.exit(failed ? 1 : 0)
      }),
    )
}
