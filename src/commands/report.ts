import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Command } from 'commander'
import { buildReport } from '../lib/report.ts'
import { loadReview, loadRun, resolveRunDir } from '../lib/runs.ts'
import { guard, root } from './shared.ts'

export function registerReport(program: Command): void {
  program
    .command('report')
    .description(
      'Export a portable offline HTML report with original screenshots and saved decisions',
    )
    .option('--run <id>', 'run id or directory', 'latest')
    .option('--out <file>', 'HTML output path', 'design-spine-report.html')
    .option('--force', 'overwrite an existing output file')
    .action(
      guard((o: { run: string; out: string; force?: boolean }) => {
        const dir = resolveRunDir(root, o.run)
        const out = resolve(root, o.out)
        const html = buildReport(dir, loadRun(dir), loadReview(dir))
        try {
          // 'wx' fails on any existing path, including a dangling symlink.
          writeFileSync(out, html, { flag: o.force ? 'w' : 'wx' })
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code === 'EEXIST')
            throw new Error('Output already exists; choose a new --out path or pass --force.')
          throw e
        }
        console.log(`Report saved to ${out}`)
      }),
    )
}
