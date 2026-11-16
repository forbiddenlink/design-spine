import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { loadReview, loadRun, resolveRunDir, runIdOf, summarizeRun } from './lib/runs.ts'
import type { Box, ReviewFile, RunRecord } from './lib/types.ts'

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
  const { tiles, approved, rejected, pending, flagged } = summarizeRun(run, review)
  return {
    runId: run.id,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    tiles,
    approved,
    rejected,
    pending,
    flagged,
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

const REASONS: Record<string, string> = {
  CHANGED: 'pixels differ from the baseline beyond the threshold',
  subtle: 'a faint change below the per-pixel tolerance, such as a small color shift',
  'size-changed': 'the screenshot size differs from the baseline',
  'structure-changed': 'pixels match but the accessibility tree changed',
  new: 'no approved baseline exists for this tile yet',
  'no-capture': 'the tile was not captured',
  'modified-capture': 'the captured file no longer matches its recorded hash',
  'modified-baseline': 'the baseline file no longer matches its recorded hash',
  unreadable: 'a baseline or capture PNG could not be decoded',
}

interface DiffFileRow {
  id: string
  result: string
  ratio: string
  diffImage?: string
  box?: Box
}

/** Changed, new and failed tiles from the diff.json that `spine diff` wrote; never runs a diff. */
export function spineChangedTiles(root: string, runId?: string) {
  const dir = resolveRunDir(root, runId)
  const run = loadRun(dir)
  const file = join(dir, 'diff.json')
  if (!existsSync(file))
    throw new Error(
      `No diff.json for run ${run.id}. Run \`spine diff --run ${runIdOf(dir)}\` first.`,
    )
  const diff = JSON.parse(readFileSync(file, 'utf8')) as { policy?: string; rows?: DiffFileRow[] }
  const tiles = (diff.rows ?? [])
    .filter((r) => r.result !== 'ok')
    .map((r) => ({
      id: r.id,
      result: r.result,
      ratio: r.ratio,
      box: r.box ?? null,
      diffImage: r.diffImage ?? null,
      reason: REASONS[r.result] ?? r.result,
    }))
  return { runId: run.id, policy: diff.policy ?? 'pixels', tiles }
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
  {
    name: 'spine_changed_tiles',
    description:
      'Changed, new and failed tiles of a run (default: latest) from the diff.json that `spine diff` wrote: id, result, ratio, box {x,y,w,h} of the changed pixels (null when none), diff image path and the reason. Errors with a hint to run `spine diff` when there is no diff.json. Read-only: it never approves, rejects or runs a diff.',
    inputSchema: {
      type: 'object',
      properties: { run: { type: 'string', description: 'run id or path; default latest' } },
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
        case 'spine_changed_tiles': {
          const run = args.run
          if (run !== undefined && typeof run !== 'string') return err('run must be a string')
          return ok(spineChangedTiles(root, run))
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
