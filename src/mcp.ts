import { join } from 'node:path'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { isFlagged, loadReview, loadRun, resolveRunDir, runIdOf } from './lib/runs.ts'
import type { ReviewFile, RunRecord } from './lib/types.ts'

/**
 * Read-only MCP server. It only calls loaders that read (resolveRunDir, loadRun,
 * loadReview) and registers no tool that writes, so the process cannot change a
 * review decision. Do not import writeJson, mergeReview or setLatest here.
 */

const STATUSES = ['approved', 'rejected', 'pending'] as const
type TileStatus = (typeof STATUSES)[number]

const statusOf = (review: ReviewFile, id: string): TileStatus => {
  const d = review.tiles[id]?.decision
  return d === 'approve' ? 'approved' : d === 'reject' ? 'rejected' : 'pending'
}

function latest(root: string): { dir: string; run: RunRecord; review: ReviewFile } {
  const dir = resolveRunDir(root)
  return { dir, run: loadRun(dir), review: loadReview(dir) }
}

export function spineStatus(root: string) {
  const { dir, run, review } = latest(root)
  const counts = { approved: 0, rejected: 0, pending: 0 }
  for (const t of run.tiles) counts[statusOf(review, t.id)]++
  return {
    runId: run.id,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    tiles: run.tiles.length,
    ...counts,
    flagged: run.tiles.filter(isFlagged).length,
    runDir: dir,
    reviewCommand: `spine review --run ${runIdOf(dir)}`,
  }
}

export function spineListTiles(root: string, status?: TileStatus) {
  const { dir, run, review } = latest(root)
  return run.tiles
    .map((t) => ({
      id: t.id,
      route: t.route,
      state: t.state,
      viewport: t.viewport,
      theme: t.theme,
      imagePath: join(dir, t.file),
      imageHash: t.imageHash ?? null,
      status: statusOf(review, t.id),
    }))
    .filter((row) => !status || row.status === status)
}

const TOOLS = [
  {
    name: 'spine_status',
    description:
      'Summary of the latest design-spine run: run id and times, tile count, approved/rejected/pending counts, flagged count, run directory and the command that opens the contact sheet. Read-only.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  },
  {
    name: 'spine_list_tiles',
    description:
      'List tiles of the latest run with route, state, viewport, theme, image path, image hash (null if not recorded) and review status. Optional status filter. Read-only.',
    inputSchema: {
      type: 'object',
      properties: { status: { type: 'string', enum: [...STATUSES] } },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  },
]

const ok = (data: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(data) }] })
const err = (message: string) => ({
  isError: true,
  content: [{ type: 'text' as const, text: message }],
})

export function createSpineMcpServer(root: string): Server {
  const server = new Server(
    { name: 'design-spine', version: '0.2.1' },
    { capabilities: { tools: {} } },
  )
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }))
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    try {
      const args = (req.params.arguments ?? {}) as Record<string, unknown>
      switch (req.params.name) {
        case 'spine_status':
          return ok(spineStatus(root))
        case 'spine_list_tiles': {
          const status = args.status
          if (status !== undefined && !STATUSES.includes(status as TileStatus))
            return err(`status must be one of: ${STATUSES.join(', ')}`)
          return ok(spineListTiles(root, status as TileStatus | undefined))
        }
        default:
          return err(`Unknown tool: ${req.params.name}`)
      }
    } catch (e) {
      return err((e as Error).message)
    }
  })
  return server
}

/** Serve over stdio. stdout carries the protocol, so nothing else may print to it. */
export async function runMcp(root: string): Promise<void> {
  await createSpineMcpServer(root).connect(new StdioServerTransport())
}
