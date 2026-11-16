import { resolve } from 'node:path'
import type { Command } from 'commander'
import { loadManifest, planJobs } from '../lib/capture.ts'
import { unfinishedLines } from '../lib/doctor.ts'
import { validateManifest } from '../lib/manifest.ts'
import { guard, root } from './shared.ts'

export function registerDoctor(program: Command): void {
  program
    .command('doctor')
    .description(
      'Validate capture configuration and show unfinished coverage without opening a browser',
    )
    .option('--manifest <file>', 'manifest path', 'design-spine.json')
    .option('--verbose', 'list every unfinished tile instead of one line per route and state')
    .action(
      guard((o: { manifest: string; verbose?: boolean }) => {
        if (!doctorAction(o)) process.exit(1)
      }),
    )
}

/** Prints the coverage report. Returns false when coverage is unfinished (doctor exits 1). */
export function doctorAction(o: { manifest: string; verbose?: boolean }): boolean {
  const manifest = validateManifest(loadManifest(resolve(root, o.manifest)), root)
  const { jobs, coverage } = planJobs(manifest)
  const skipped = coverage.filter((entry) => entry.outcome === 'skipped')
  const excluded = coverage.filter((entry) => entry.outcome === 'excluded')
  console.log(
    `${jobs.length} capturable, ${skipped.length} unfinished, ${excluded.length} intentionally excluded tiles.`,
  )
  for (const line of unfinishedLines(coverage, o.verbose)) console.log(line)
  return !skipped.length && jobs.length > 0
}
