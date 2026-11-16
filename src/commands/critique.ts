import { join } from 'node:path'
import type { Command } from 'commander'
import { collectDesignRules } from '../lib/critique.ts'
import { runCritique } from '../lib/critique-run.ts'
import { isFlagged, loadRun, resolveRunDir } from '../lib/runs.ts'
import { guard, numberOption, root } from './shared.ts'

export function registerCritique(program: Command): void {
  program
    .command('critique')
    .description('Vision critique of each tile via the Claude Code CLI')
    .option('--run <id>', 'run id or path', 'latest')
    .option('--only-flagged', 'only tiles with automatic flags')
    .option('--limit <n>', 'max tiles')
    .option('--model <name>', 'Claude model', 'sonnet')
    .option('--claude-bin <path>', 'claude binary', process.env.SPINE_CLAUDE_BIN ?? 'claude')
    .option('--timeout <seconds>', 'per-tile limit before claude is killed', '300')
    .option(
      '--repo <dir>',
      'app repo to read DESIGN.md / .impeccable.md / @theme from (default: cwd)',
    )
    .action(
      guard(
        async (o: {
          repo?: string
          run: string
          onlyFlagged?: boolean
          limit?: string
          model: string
          claudeBin: string
          timeout: string
        }) => {
          const timeoutSeconds = numberOption(o.timeout, 'timeout', 1, 3600)
          const limit = o.limit === undefined ? undefined : numberOption(o.limit, 'limit', 1)
          const dir = resolveRunDir(root, o.run)
          let tiles = loadRun(dir).tiles.filter((t) => !t.error)
          if (o.onlyFlagged) tiles = tiles.filter(isFlagged)
          if (limit !== undefined) tiles = tiles.slice(0, limit)
          if (!tiles.length) return console.log('Nothing to critique.')
          const f = await runCritique({
            runDir: dir,
            tiles,
            bin: o.claudeBin,
            model: o.model,
            // Without the app's own design docs the critique called the brand's
            // closing-quote glyph and the language switcher "stray" defects.
            rules: collectDesignRules(o.repo ?? root),
            timeoutMs: timeoutSeconds * 1000,
            log: console.log,
          })
          console.log(`Wrote ${join(dir, 'critique.json')} (${Object.keys(f.tiles).length} tiles)`)
          const errored = tiles.filter((t) => f.tiles[t.id]?.verdict === 'error').length
          if (errored) {
            console.error(
              `${errored} tile(s) failed to critique; see critique.json for the errors.`,
            )
            process.exitCode = 1
          }
        },
      ),
    )
}
