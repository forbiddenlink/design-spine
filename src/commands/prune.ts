import { rmSync } from 'node:fs'
import type { Command } from 'commander'
import { pruneCandidates } from '../lib/runs.ts'
import { guard, numberOption, root } from './shared.ts'

export function registerPrune(program: Command): void {
  program
    .command('prune')
    .description('Delete old runs, keeping the newest and the latest')
    .option('--keep <n>', 'runs to keep', '5')
    .option('--dry-run', 'list what would be deleted without deleting')
    .action(
      guard((o: { keep: string; dryRun?: boolean }) => {
        const keep = numberOption(o.keep, 'keep', 1, 10000)
        const doomed = pruneCandidates(root, keep)
        const mb = (bytes: number): string => `${(bytes / 1024 / 1024).toFixed(1)} MB`
        const total = doomed.reduce((sum, run) => sum + run.bytes, 0)
        if (!doomed.length) {
          console.log(`Nothing to prune; at most ${keep} runs besides latest.`)
          return
        }
        for (const run of doomed) {
          if (!o.dryRun) rmSync(run.dir, { recursive: true, force: true })
          console.log(`${o.dryRun ? 'would delete' : 'deleted'} ${run.id}  ${mb(run.bytes)}`)
        }
        console.log(
          `${o.dryRun ? 'Would free' : 'Freed'} ${mb(total)} from ${doomed.length} run${doomed.length === 1 ? '' : 's'}. Baselines are untouched.`,
        )
      }),
    )
}
