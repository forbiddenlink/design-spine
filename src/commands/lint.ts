import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { Command } from 'commander'
import {
  byFile,
  canUpdateBaseline,
  defaultScanDir,
  evaluateRatchet,
  type LintBaseline,
  newOffenders,
  scanDir,
} from '../lib/lint.ts'
import { readStateJson, spineDir, writeJson } from '../lib/runs.ts'
import { guard, root } from './shared.ts'

export function lintBaselinePath(): string {
  return join(spineDir(root), 'lint-baseline.json')
}

export function registerLint(program: Command): void {
  program
    .command('lint')
    .description('Arbitrary Tailwind value ratchet')
    .option('--exceptions', 'list explained single-line exceptions')
    .option('--dir <dir>', 'directory to scan (default: src, else app, else .)')
    .option('--update', 'write the baseline')
    .option('--force', 'allow --update to raise the baseline')
    .action(
      guard((o: { dir?: string; update?: boolean; force?: boolean; exceptions?: boolean }) => {
        const dirName = o.dir ?? defaultScanDir(root)
        const dir = resolve(root, dirName)
        if (!existsSync(dir)) throw new Error(`Directory ${dirName} not found.`)
        if (o.exceptions) {
          for (const match of scanDir(dir, true))
            console.log(
              `${dirName}/${match.file}:${match.line}:${match.col} ${match.text}: ${match.reason}`,
            )
          return
        }
        const matches = scanDir(dir)
        const base = readStateJson<LintBaseline>(lintBaselinePath())
        if (base && !Number.isFinite(base.count))
          throw new Error(`Invalid ${lintBaselinePath()}: count must be a number.`)
        const { ok, delta } = evaluateRatchet(matches.length, base?.count ?? null)
        console.log(`Arbitrary values: ${matches.length} (baseline ${base ? base.count : 'none'})`)
        if (o.update) {
          if (!canUpdateBaseline(matches.length, base?.count ?? null, !!o.force)) {
            console.error(
              `Refusing to raise the baseline from ${base?.count} to ${matches.length}. Pass --force.`,
            )
            process.exit(1)
          }
          writeJson(lintBaselinePath(), {
            count: matches.length,
            files: byFile(matches),
            updatedAt: new Date().toISOString(),
          })
          console.log(`Baseline written (${matches.length}).`)
          return
        }
        if (!ok) {
          console.error(`Count rose by ${delta}. New offenders:`)
          for (const m of newOffenders(matches, base?.files ?? {}))
            console.error(`  ${dirName}/${m.file}:${m.line}:${m.col}  ${m.text}`)
          process.exit(1)
        }
      }),
    )
}
