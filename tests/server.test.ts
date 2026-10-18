import { type ChildProcess, spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const root = mkdtempSync(join(tmpdir(), 'spine-server-'))
let child: ChildProcess | undefined
let base = ''

beforeAll(async () => {
  const runs = join(root, '.design-spine/runs')
  mkdirSync(join(runs, 'broken'), { recursive: true })
  writeFileSync(join(runs, 'broken/run.json'), '{"id":')
  const script = join(root, 'server.ts')
  writeFileSync(
    script,
    `import { startReviewServer } from ${JSON.stringify(resolve('src/lib/server.ts'))}; const server = startReviewServer(${JSON.stringify(join(runs, 'broken'))}, 0); console.log('READY '+server.port);`,
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
    child?.on('exit', () => {
      clearTimeout(timer)
      rej(new Error('Review server exited'))
    })
  })
  base = `http://127.0.0.1:${port}`
})

afterAll(() => {
  child?.kill()
  rmSync(root, { recursive: true, force: true })
})

describe('review server', () => {
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
})
