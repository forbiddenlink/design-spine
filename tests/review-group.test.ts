import { type ChildProcess, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { PNG } from 'pngjs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const root = mkdtempSync(join(tmpdir(), 'spine-group-'))
const runDir = join(root, '.design-spine/runs/a')
let child: ChildProcess | undefined
let base = ''

function png(barY: number | null): Buffer {
  const image = new PNG({ width: 200, height: 600 })
  image.data.fill(255)
  if (barY !== null)
    for (let y = barY; y < barY + 30; y++)
      for (let x = 0; x < 200; x++) {
        const o = (y * 200 + x) * 4
        image.data[o] = 0
        image.data[o + 1] = 0
        image.data[o + 2] = 0
      }
  return PNG.sync.write(image)
}

/** Three pages changed the same way at the top, one changed lower down, one unchanged. */
const layout: Record<string, number | null> = { a: 10, b: 12, c: 10, d: 400, e: null }

beforeAll(async () => {
  mkdirSync(runDir, { recursive: true })
  mkdirSync(join(root, '.design-spine/baselines'), { recursive: true })
  const tiles = []
  for (const [id, barY] of Object.entries(layout)) {
    writeFileSync(join(root, '.design-spine/baselines', `${id}.png`), png(null))
    const bytes = png(barY)
    writeFileSync(join(runDir, `${id}.png`), bytes)
    tiles.push({
      id,
      file: `${id}.png`,
      route: `/${id}`,
      path: `/${id}`,
      state: 'default',
      viewport: 200,
      theme: 'light',
      status: 200,
      consoleErrors: [],
      pageErrors: [],
      brokenImages: [],
      overflowX: false,
      textClipped: [],
      blankRegions: { count: 0, boxes: [] },
      imageHash: createHash('sha256').update(bytes).digest('hex'),
    })
  }
  writeFileSync(
    join(runDir, 'run.json'),
    JSON.stringify({ id: 'a', baseUrl: 'http://example.test', tiles }),
  )
  const script = join(root, 'server.ts')
  writeFileSync(
    script,
    `import { startReviewServer } from ${JSON.stringify(resolve('src/lib/server.ts'))}; const server = startReviewServer(${JSON.stringify(runDir)}, 0); console.log('READY '+server.port);`,
  )
  child = spawn('bun', [script], { stdio: ['ignore', 'pipe', 'pipe'] })
  const port = await new Promise<string>((res, rej) => {
    const timer = setTimeout(() => rej(new Error('Review server did not start')), 10000)
    child?.stdout?.on('data', (data) => {
      const match = String(data).match(/READY (\d+)/)
      if (match) {
        clearTimeout(timer)
        res(match[1] ?? '')
      }
    })
  })
  base = `http://127.0.0.1:${port}`
}, 20000)

afterAll(() => {
  child?.kill()
  rmSync(root, { recursive: true, force: true })
})

const post = (body: unknown) =>
  fetch(`${base}/api/review/bulk`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
const saved = () => JSON.parse(readFileSync(join(runDir, 'review.json'), 'utf8')).tiles

describe('group by cause', () => {
  it('exposes groups of two or more tiles with the same change on the comparison report', async () => {
    const report = await (await fetch(`${base}/api/comparison`)).json()
    expect(report.groups).toHaveLength(1)
    expect(report.groups[0].tileIds).toEqual(['a', 'b', 'c'])
    expect(report.groups[0].label).toMatch(/^3 tiles, same change near top/)
  }, 60000)

  it('refuses a bulk decision that was not confirmed or names an unknown tile', async () => {
    expect((await post({ tileIds: ['a', 'b'], decision: 'approve' })).status).toBe(400)
    expect(
      (await post({ tileIds: ['a', 'nope'], decision: 'approve', confirmed: true })).status,
    ).toBe(400)
    expect((await post({ tileIds: [], decision: 'approve', confirmed: true })).status).toBe(400)
    expect((await post({ tileIds: ['a'], decision: 'maybe', confirmed: true })).status).toBe(400)
    expect(() => readFileSync(join(runDir, 'review.json'), 'utf8')).toThrow()
  })

  it('records every confirmed tile individually with the shared note and leaves others alone', async () => {
    const response = await post({
      tileIds: ['a', 'b', 'c'],
      decision: 'approve',
      note: 'Header font from dependency bump',
      confirmed: true,
    })
    expect(response.status).toBe(200)
    const tiles = saved()
    expect(Object.keys(tiles).sort()).toEqual(['a', 'b', 'c'])
    for (const id of ['a', 'b', 'c']) {
      expect(tiles[id].decision).toBe('approve')
      expect(tiles[id].note).toBe('Header font from dependency bump')
    }
    // Each tile is still an ordinary entry, so the per-tile endpoint can undo one.
    const undo = await fetch(`${base}/api/review`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tileId: 'b', decision: null }),
    })
    expect(undo.status).toBe(200)
    expect(saved().b.decision).toBeNull()
    expect(saved().a.decision).toBe('approve')
  })
})
