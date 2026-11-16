import type { Command } from 'commander'
import { runMcp } from '../mcp.ts'
import { guard, root } from './shared.ts'

export function registerMcp(program: Command): void {
  program
    .command('mcp')
    .description('Serve a read-only MCP server over stdio (spine_status, spine_list_tiles)')
    .action(guard(() => runMcp(root)))
}
