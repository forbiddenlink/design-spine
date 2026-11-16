import { existsSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { Command } from 'commander'
import { defaultScanDir, type LintBaseline, scanDir } from '../lib/lint.ts'
import {
  baselinesDir,
  loadReview,
  loadRun,
  readStateJson,
  resolveRunDir,
  spineDir,
  summarizeRun,
  writeJson,
} from '../lib/runs.ts'
import { lintBaselinePath } from './lint.ts'
import { guard, root } from './shared.ts'

export function registerStatus(program: Command): void {
  program
    .command('status')
    .description('Write and print .design-spine/status.json')
    .option('--dir <dir>', 'lint directory (default: src, else app, else .)')
    .action(
      guard((o: { dir?: string }) => {
        let lastRun: string | null = null
        let counts = { tiles: 0, flagged: 0, approved: 0, rejected: 0 }
        let dir: string | null = null
        try {
          dir = resolveRunDir(root)
        } catch {
          // no runs yet
        }
        // A run that exists but does not load is an error, not an empty project.
        if (dir) {
          const run = loadRun(dir)
          lastRun = run.id
          counts = summarizeRun(run, loadReview(dir))
        }
        const ldir = resolve(root, o.dir ?? defaultScanDir(root))
        const lintCount = existsSync(ldir) ? scanDir(ldir).length : null
        const lb = readStateJson<LintBaseline>(lintBaselinePath())
        const bdir = baselinesDir(root)
        const baselines = existsSync(bdir)
          ? readdirSync(bdir).filter((f) => f.endsWith('.png')).length
          : 0
        const status = {
          lastRun,
          tiles: counts.tiles,
          flagged: counts.flagged,
          reviewed: counts.approved + counts.rejected,
          approved: counts.approved,
          rejected: counts.rejected,
          lintCount,
          lintBaseline: lb?.count ?? null,
          baselines,
        }
        writeJson(join(spineDir(root), 'status.json'), status)
        console.log(JSON.stringify(status, null, 2))
      }),
    )
}
