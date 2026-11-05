import { mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { afterEach, describe, expect, it } from 'vitest'
import type { ReviewFile, RunRecord, Tile } from '../src/lib/types.ts'
import { createSpineMcpServer } from '../src/mcp.ts'

const HASH = 'a'.repeat(64)

const tile = (id: string, over: Partial<Tile> = {}): Tile => ({
  id,
  file: `${id}.png`,
  route: '/dash',
  path: '/dash',
  state: 'ideal',
  viewport: 1280,
  theme: 'light',
  status: 200,
  consoleErrors: [],
  pageErrors: [],
  overflowX: false,
  blankRegions: { count: 0, boxes: [] },
  brokenImages: [],
  textClipped: [],
  ...over,
})

/** Fixture project: four tiles, one approved, one rejected, two pending. */
function project(): { root: string; runDir: string } {
  const root = mkdtempSync(join(tmpdir(), 'spine-mcp-'))
  const runDir = join(root, '.design-spine/runs/run-1')
  mkdirSync(runDir, { recursive: true })
  const run: RunRecord = {
    id: 'run-1',
    startedAt: '2026-11-01T10:00:00Z',
    finishedAt: '2026-11-01T10:01:00Z',
    baseUrl: 'http://localhost:3000',
    tiles: [
      tile('a', { imageHash: HASH }),
      tile('b', { state: 'empty', theme: 'dark', consoleErrors: ['boom'] }),
      tile('c', { route: '/settings', path: '/settings', viewport: 390 }),
      tile('d', { route: '/settings', path: '/settings', state: 'empty' }),
    ],
  }
  writeFileSync(join(runDir, 'run.json'), JSON.stringify(run))
  const review: ReviewFile = {
    tiles: {
      a: { decision: 'approve', note: '', updatedAt: '2026-11-01T11:00:00Z' },
      b: { decision: 'reject', note: 'clipped', updatedAt: '2026-11-01T11:00:00Z' },
      c: { decision: null, note: 'maybe', updatedAt: '2026-11-01T11:00:00Z' },
    },
  }
  writeFileSync(join(runDir, 'review.json'), JSON.stringify(review))
  return { root, runDir }
}

/** path -> "mtimeMs:content" for every file under dir. */
function snapshot(dir: string, out: Record<string, string> = {}): Record<string, string> {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) snapshot(p, out)
    else out[p] = `${statSync(p).mtimeMs}:${readFileSync(p, 'utf8')}`
  }
  return out
}

const open: Client[] = []
async function connect(root: string): Promise<Client> {
  const server = createSpineMcpServer(root)
  const client = new Client({ name: 'test', version: '0' })
  const [a, b] = InMemoryTransport.createLinkedPair()
  await Promise.all([server.connect(a), client.connect(b)])
  open.push(client)
  return client
}
afterEach(async () => {
  await Promise.all(open.splice(0).map((c) => c.close()))
})

const json = <T = Record<string, unknown>>(r: unknown): T => {
  const content = (r as { content: { type: string; text: string }[] }).content
  return JSON.parse(content[0]?.text ?? 'null')
}

describe('spine mcp tool list', () => {
  it('exposes exactly the two read-only tools', async () => {
    const client = await connect(project().root)
    const { tools } = await client.listTools()
    expect(tools.map((t) => t.name).sort()).toEqual(['spine_list_tiles', 'spine_status'])
    for (const t of tools) expect(t.annotations?.readOnlyHint).toBe(true)
  })
})

describe('spine_status', () => {
  it('summarises the latest run from files already on disk', async () => {
    const { root, runDir } = project()
    const client = await connect(root)
    const s = json(await client.callTool({ name: 'spine_status', arguments: {} }))
    expect(s).toMatchObject({
      runId: 'run-1',
      startedAt: '2026-11-01T10:00:00Z',
      finishedAt: '2026-11-01T10:01:00Z',
      tiles: 4,
      approved: 1,
      rejected: 1,
      pending: 2,
      flagged: 1,
      runDir,
    })
    expect(s.reviewCommand).toContain('spine review --run run-1')
  })

  it('treats a missing review.json as all pending', async () => {
    const { root, runDir } = project()
    const { rmSync } = await import('node:fs')
    rmSync(join(runDir, 'review.json'))
    const client = await connect(root)
    const s = json(await client.callTool({ name: 'spine_status', arguments: {} }))
    expect(s).toMatchObject({ approved: 0, rejected: 0, pending: 4 })
  })

  it('reports a tool error when there is no run yet', async () => {
    const empty = mkdtempSync(join(tmpdir(), 'spine-mcp-empty-'))
    const client = await connect(empty)
    const r = await client.callTool({ name: 'spine_status', arguments: {} })
    expect(r.isError).toBe(true)
  })
})

describe('spine_list_tiles', () => {
  it('lists every tile with route, state, viewport, image path, hash and status', async () => {
    const { root, runDir } = project()
    const client = await connect(root)
    const rows = json<Record<string, unknown>[]>(
      await client.callTool({ name: 'spine_list_tiles', arguments: {} }),
    )
    expect(rows).toHaveLength(4)
    expect(rows[0]).toEqual({
      id: 'a',
      route: '/dash',
      state: 'ideal',
      viewport: 1280,
      theme: 'light',
      imagePath: join(runDir, 'a.png'),
      imageHash: HASH,
      status: 'approved',
    })
    expect(rows[1]).toMatchObject({ id: 'b', status: 'rejected', imageHash: null })
    expect(rows[2]).toMatchObject({ id: 'c', status: 'pending' })
    expect(rows[3]).toMatchObject({ id: 'd', status: 'pending' })
  })

  it.each([
    ['approved', ['a']],
    ['rejected', ['b']],
    ['pending', ['c', 'd']],
  ])('filters by status %s', async (status, ids) => {
    const client = await connect(project().root)
    const rows = json<{ id: string }[]>(
      await client.callTool({ name: 'spine_list_tiles', arguments: { status } }),
    )
    expect(rows.map((r) => r.id)).toEqual(ids)
  })

  it('rejects an unknown status filter', async () => {
    const client = await connect(project().root)
    const r = await client.callTool({ name: 'spine_list_tiles', arguments: { status: 'bogus' } })
    expect(r.isError).toBe(true)
  })
})

describe('read-only guarantee', () => {
  it('leaves every file under .design-spine byte- and mtime-identical after all calls', async () => {
    const { root } = project()
    const before = snapshot(join(root, '.design-spine'))
    const client = await connect(root)
    await client.callTool({ name: 'spine_status', arguments: {} })
    await client.callTool({ name: 'spine_list_tiles', arguments: {} })
    for (const status of ['approved', 'rejected', 'pending'])
      await client.callTool({ name: 'spine_list_tiles', arguments: { status } })
    expect(snapshot(join(root, '.design-spine'))).toEqual(before)
  })

  it('does not create review.json when none exists', async () => {
    const { root, runDir } = project()
    const { rmSync, existsSync } = await import('node:fs')
    rmSync(join(runDir, 'review.json'))
    const client = await connect(root)
    await client.callTool({ name: 'spine_status', arguments: {} })
    await client.callTool({ name: 'spine_list_tiles', arguments: {} })
    expect(existsSync(join(runDir, 'review.json'))).toBe(false)
  })
})
