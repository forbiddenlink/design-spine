import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { Command } from 'commander'
import { baselineManifestPath, promoteBaselines, selectApproved } from '../lib/baselines.ts'
import {
  baselinesDir,
  loadBaselineManifest,
  loadReview,
  loadRun,
  resolveRunDir,
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
        const manifest = loadBaselineManifest(baselineManifestPath(root))
        const selected = selectApproved(dir, run, review)
        if (o.dryRun) {
          for (const { tile } of selected)
            console.log(
              `${existsSync(join(bdir, tile.file)) ? 'replace' : 'add'} ${tile.id} (${tile.file})`,
            )
          console.log(`Dry run: ${selected.length} tiles would be promoted into ${bdir}`)
          return
        }
        if (!selected.length) {
          console.log('No approved tiles in this run. Approve screens in `spine review` first.')
          return
        }
        const n = promoteBaselines(root, run, selected, manifest)
        console.log(`Approved ${n} tiles into ${bdir}`)
      }),
    )
}
