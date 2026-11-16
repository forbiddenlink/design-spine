import { type ChildProcess, spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const root = mkdtempSync(join(tmpdir(), 'spine-server-'))
const runs = join(root, '.design-spine/runs')
const children: ChildProcess[] = []
let base = ''
let failedBase = ''

/** Start a review server for one run directory in its own Bun process; resolves to its URL. */
async function serve(runDir: string): Promise<string> {
  const script = join(root, `server-${children.length}.ts`)
  writeFileSync(
    script,
    `import { startReviewServer } from ${JSON.stringify(resolve('src/lib/server.ts'))}; const server = startReviewServer(${JSON.stringify(runDir)}, 0); console.log('READY '+server.port);`,
  )
  const child = spawn('bun', [script], { stdio: ['ignore', 'pipe', 'pipe'] })
  children.push(child)
  const port = await new Promise<string>((res, rej) => {
    const timer = setTimeout(() => rej(new Error('Review server did not start')), 10000)
    child.stdout?.on('data', (data) => {
      const match = String(data).match(/READY (\d+)/)
      if (match) {
        clearTimeout(timer)
        res(match[1] ?? '')
      }
    })
    child.on('exit', () => {
      clearTimeout(timer)
      rej(new Error('Review server exited'))
    })
  })
  return `http://127.0.0.1:${port}`
}

beforeAll(async () => {
  mkdirSync(join(runs, 'broken'), { recursive: true })
  writeFileSync(join(runs, 'broken/run.json'), '{"id":')
  mkdirSync(join(runs, 'failed'), { recursive: true })
  writeFileSync(
    join(runs, 'failed/run.json'),
    JSON.stringify({
      id: 'failed',
      startedAt: '',
      finishedAt: '',
      baseUrl: 'http://localhost',
      tiles: [
        {
          id: 'down',
          file: 'down.png',
          route: '/',
          path: '/',
          state: 'ideal',
          viewport: 390,
          theme: 'light',
          status: 0,
          error: 'net::ERR_CONNECTION_REFUSED',
          consoleErrors: [],
          pageErrors: [],
          brokenImages: [],
          textClipped: [],
          overflowX: false,
          blankRegions: { count: 0, boxes: [] },
        },
      ],
    }),
  )
  ;[base, failedBase] = await Promise.all([
    serve(join(runs, 'broken')),
    serve(join(runs, 'failed')),
  ])
}, 20000)

afterAll(() => {
  for (const child of children) child.kill()
  rmSync(root, { recursive: true, force: true })
})

describe('review server', () => {
  it('serves the review assets with fixed routes and correct content types', async () => {
    const html = await (await fetch(base)).text()
    expect(html).toContain('src="/assets/review.js"')
    expect(html).toContain('href="/assets/review.css"')
    for (const [name, type, content] of [
      ['review.js', 'text/javascript', 'function renderCoverage'],
      ['review.css', 'text/css', '--accent'],
    ]) {
      const response = await fetch(`${base}/assets/${name}`)
      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toContain(type)
      expect(await response.text()).toContain(content)
    }
    expect((await fetch(`${base}/assets/server.ts`)).status).toBe(404)
  })
  it('forbids framing on every response', async () => {
    for (const path of ['/', '/api/runs', '/nope']) {
      const res = await fetch(base + path)
      expect(res.headers.get('x-frame-options'), path).toBe('DENY')
      expect(res.headers.get('content-security-policy'), path).toContain("frame-ancestors 'none'")
    }
  })
  it('reports an unreadable run as 422 with a message instead of an opaque 500', async () => {
    for (const path of ['/api/run', '/api/comparison']) {
      const res = await fetch(base + path)
      expect(res.status, path).toBe(422)
      expect(typeof ((await res.json()) as { error: string }).error).toBe('string')
    }
  })
  it('refuses to approve a failed capture, even with a note, and still accepts a rejection', async () => {
    const post = (body: object) =>
      fetch(`${failedBase}/api/review`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
    const approve = await post({ tileId: 'down', decision: 'approve', note: 'looks fine' })
    expect(approve.status).toBe(422)
    expect(((await approve.json()) as { error: string }).error).toContain('capture failed')
    expect((await post({ tileId: 'down', decision: 'reject' })).status).toBe(200)
  })
})
