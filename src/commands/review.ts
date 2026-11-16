import type { Command } from 'commander'
import { resolveRunDir, runIdOf } from '../lib/runs.ts'
import { startReviewServer } from '../lib/server.ts'
import { guard, numberOption, root } from './shared.ts'

export function registerReview(program: Command): void {
  program
    .command('review')
    .description('Serve the contact sheet review app')
    .option('--run <id>', 'run id or path', 'latest')
    .option('--port <n>', 'port', '4747')
    .action(
      guard((o: { run: string; port: string }) => {
        const port = numberOption(o.port, 'port', 0, 65535)
        const dir = resolveRunDir(root, o.run)
        const server = startReviewServer(dir, port)
        console.log(`Reviewing ${runIdOf(dir)}\nhttp://localhost:${server.port}`)
      }),
    )
}
