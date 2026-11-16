import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, expect, it } from 'vitest'

const root = mkdtempSync(join(tmpdir(), 'spine-start-'))
afterAll(() => rmSync(root, { recursive: true, force: true }))

const freePort = (): Promise<number> =>
  new Promise((done, fail) => {
    const server = createServer()
    server.on('error', fail)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      server.close(() => done(typeof address === 'object' && address ? address.port : 0))
    })
  })

const answers = async (url: string): Promise<boolean> => {
  try {
    await fetch(url, { signal: AbortSignal.timeout(500) })
    return true
  } catch {
    return false
  }
}

it.each([
  ['SIGINT', 130],
  ['SIGTERM', 143],
] as const)(
  'stops the started app when the CLI receives %s',
  async (signal, code) => {
    const port = await freePort()
    const url = `http://127.0.0.1:${port}`
    const app = join(root, `app-${port}.ts`)
    writeFileSync(
      app,
      `Bun.serve({ port: ${port}, hostname: '127.0.0.1', fetch: () => new Response('ok') })`,
    )
    const script = join(root, `cli-${port}.ts`)
    writeFileSync(
      script,
      `import { startApp } from ${JSON.stringify(resolve('src/lib/start.ts'))}
await startApp(${JSON.stringify(`bun ${app}`)}, ${JSON.stringify(url)}, ${JSON.stringify(root)}, 20000, () => {})
console.log('READY')
setInterval(() => {}, 1000)`,
    )
    const cli = spawn('bun', [script], { stdio: ['ignore', 'pipe', 'pipe'] })
    await new Promise<void>((done, fail) => {
      const timer = setTimeout(() => fail(new Error('app did not start')), 20000)
      cli.stdout?.on('data', (data) => {
        if (String(data).includes('READY')) {
          clearTimeout(timer)
          done()
        }
      })
      cli.on('exit', () => fail(new Error('CLI exited early')))
    })
    expect(await answers(url)).toBe(true)
    const exited = new Promise<number | null>((done) => cli.on('exit', (status) => done(status)))
    cli.kill(signal)
    expect(await exited).toBe(code)
    await expect.poll(() => answers(url), { timeout: 5000 }).toBe(false)
  },
  30000,
)
