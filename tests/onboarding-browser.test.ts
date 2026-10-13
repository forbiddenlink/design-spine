import { type ChildProcess, spawn, spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { type Browser, chromium } from 'playwright'
import { expect, it } from 'vitest'
import type { RunRecord } from '../src/lib/types.ts'

it('takes a new project from an unfinished plan to reviewed, explicitly promoted, strictly gated offline evidence', async () => {
  const root = mkdtempSync(join(tmpdir(), 'spine-onboarding-'))
  const cli = resolve('src/cli.ts')
  const binary = process.env.SPINE_CLI_BIN && resolve(process.env.SPINE_CLI_BIN)
  let application: ChildProcess | undefined
  let review: ChildProcess | undefined
  let browser: Browser | undefined
  function command(args: string[]): { status: number | null; text: string } {
    const result = spawnSync(binary || 'bun', binary ? args : [cli, ...args], {
      cwd: root,
      env: { ...process.env, SPINE_CWD: root },
      encoding: 'utf8',
      timeout: 45000,
    })
    return { status: result.status, text: result.stdout + result.stderr }
  }
  function port(child: ChildProcess): Promise<string> {
    return new Promise((res, rej) => {
      let output = ''
      const timer = setTimeout(() => rej(new Error('Synthetic server did not start')), 10000)
      child.stdout?.on('data', (bytes) => {
        output += String(bytes)
        const match = output.match(/(?:READY |http:\/\/localhost:)(\d+)/)
        if (match?.[1]) {
          clearTimeout(timer)
          res(match[1])
        }
      })
      child.once('error', (error) => {
        clearTimeout(timer)
        rej(error)
      })
      child.once('exit', () => {
        clearTimeout(timer)
        rej(new Error('Synthetic server exited'))
      })
    })
  }
  try {
    mkdirSync(join(root, 'app'), { recursive: true })
    writeFileSync(join(root, 'app/page.tsx'), 'export default function Page() { return null }')
    const script = join(root, 'application.ts')
    writeFileSync(
      script,
      `const server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch() {
      return new Response(${JSON.stringify('<!doctype html><html lang="en"><head><title>Synthetic example</title><style>body{font-family:system-ui;background:white;color:black} @media(prefers-color-scheme:dark){body{background:#111;color:white}}</style></head><body><main><h1>Review example</h1><button type="button" onclick="document.querySelector(\'output\').textContent=\'Ready\'">Prepare state</button><output aria-live="polite">Waiting</output></main></body></html>')}, { headers: { 'content-type': 'text/html' } });
    }}); console.log('READY '+server.port);`,
    )
    application = spawn('bun', [script], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] })
    const base = `http://127.0.0.1:${await port(application)}`
    expect(command(['plan', '--base', base]).status).toBe(0)
    expect(command(['doctor']).status).toBe(1)
    writeFileSync(
      join(root, 'design-spine.json'),
      JSON.stringify({
        baseUrl: base,
        viewports: [390],
        themes: { light: 'light', dark: 'dark', method: 'media' },
        capture: { animations: 'disabled', stabilityAttempts: 2, accessibility: true },
        routes: [
          {
            path: '/',
            states: [
              {
                name: 'ideal',
                steps: [{ action: 'click', selector: 'button' }],
                ready: { selector: 'output:text-is("Ready")' },
              },
            ],
          },
        ],
      }),
    )
    expect(command(['doctor']).status).toBe(0)
    const capture = command(['capture', '--base', base, '--concurrency', '1'])
    expect(capture.status, capture.text).toBe(0)
    const dir = realpathSync(join(root, '.design-spine/latest'))
    const run = JSON.parse(readFileSync(join(dir, 'run.json'), 'utf8')) as RunRecord
    expect(run.tiles).toHaveLength(2)
    expect(run.coverage?.every((entry) => entry.outcome === 'captured')).toBe(true)
    expect(
      run.tiles.every(
        (tile) =>
          tile.stability === 'stable' &&
          tile.accessibility?.violations.length === 0 &&
          !tile.accessibility.error,
      ),
    ).toBe(true)
    expect(command(['diff', '--strict']).status).toBe(1)
    expect(existsSync(join(root, '.design-spine/baselines/manifest.json'))).toBe(false)
    const args = ['review', '--port', '0']
    review = spawn(binary || 'bun', binary ? args : [cli, ...args], {
      cwd: root,
      env: { ...process.env, SPINE_CWD: root },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    browser = await chromium.launch({ headless: true })
    const page = await browser.newPage()
    await page.goto(`http://127.0.0.1:${await port(review)}`)
    await page.getByText('Comparison ready', { exact: false }).waitFor()
    for (const tile of run.tiles) {
      await page.locator(`.tile[data-id="${tile.id}"] .approve`).click()
      await page.locator(`.tile[data-id="${tile.id}"] .approve[aria-pressed="true"]`).waitFor()
    }
    await page.waitForFunction(
      () => !document.querySelector('#run-select')?.hasAttribute('disabled'),
    )
    // Review decisions alone do not create a baseline or make strict mode green.
    expect(command(['diff', '--strict']).status).toBe(1)
    expect(existsSync(join(root, '.design-spine/baselines/manifest.json'))).toBe(false)
    const approval = command(['approve'])
    expect(approval.status, approval.text).toBe(0)
    const strict = command(['diff', '--strict'])
    expect(strict.status, strict.text).toBe(0)
    expect(command(['report', '--out', 'review.html']).status).toBe(0)
    const requests: string[] = []
    await page.route(/^https?:\/\//, (route) => {
      requests.push(route.request().url())
      return route.abort()
    })
    await page.goto(`file://${join(root, 'review.html')}`)
    expect(await page.locator('img').count()).toBe(2)
    expect(
      await page
        .locator('img')
        .evaluateAll((images: HTMLImageElement[]) =>
          images.every((image) => image.complete && image.naturalWidth === 390),
        ),
    ).toBe(true)
    expect(requests).toEqual([])
  } finally {
    await browser?.close()
    review?.kill()
    application?.kill()
    rmSync(root, { recursive: true, force: true })
  }
}, 90000)
