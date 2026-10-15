import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { runCapture } from '../src/lib/capture.ts'
import { isFlagged } from '../src/lib/runs.ts'

const root = mkdtempSync(join(tmpdir(), 'spine-capture-browser-'))
let rateLimitHits = 0
const server = createServer((_req, res) => {
  res.setHeader('content-type', 'text/html')
  if (_req.url === '/rl' && ++rateLimitHits === 1) {
    res.statusCode = 429
    res.setHeader('retry-after', '0')
    res.end('<html><body>slow down</body></html>')
    return
  }
  res.end(`<html><body>${
    _req.url === '/overlay'
      ? '<header style="position:fixed;top:0;left:0;right:0;height:60px;background:#eee">Nav</header><div class="cookie-consent" style="position:fixed;bottom:0;left:0;right:0;height:300px;background:#ccc">Cookies</div>'
      : ''
  }<button id="go" onclick="document.querySelector('h1').textContent='Changed';setTimeout(()=>document.body.dataset.clicked='yes',80)">Change</button>
    <h1>Initial</h1><div id="result"></div><script>
    ${_req.url === '/unstable' ? "let n=0;setInterval(()=>document.querySelector('h1').textContent=String(++n),10);" : ''}
    fetch('/data').then(r=>r.text()).then(t=>{document.querySelector('#result').textContent=t;document.body.dataset.ready='yes'})
    </script></body></html>`)
})
let base = ''
beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('No address')
  base = `http://127.0.0.1:${address.port}`
})
afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
  rmSync(root, { recursive: true, force: true })
})

it('captures explicit interactive states and records readiness failures without losing coverage', async () => {
  writeFileSync(join(root, 'bad-session.json'), '{not json')
  const result = await runCapture({
    root,
    baseUrl: base,
    concurrency: 2,
    manifest: {
      baseUrl: base,
      viewports: [390],
      themes: { light: 'light', dark: 'dark', method: 'media' },
      capture: {
        clock: '2026-10-10T12:00:00Z',
        stabilityAttempts: 3,
        animations: 'disabled',
        accessibility: true,
      },
      routes: [
        {
          path: '/',
          states: [
            {
              name: 'ideal',
              responses: [{ url: '**/data', status: 200, body: 'Fixture result' }],
              steps: [{ action: 'click', selector: '#go' }],
              ready: { selector: 'body[data-clicked="yes"]' },
              masks: [{ selector: '#result', reason: 'Dynamic result excluded deliberately' }],
            },
            { name: 'timeout', ready: { selector: '#never', timeoutMs: 50 } },
            { name: 'empty', todo: true },
            { name: 'bad-session', storageState: 'bad-session.json' },
          ],
        },
        { path: '/unstable', states: [{ name: 'moving' }] },
      ],
    },
  })
  expect(result.run.schemaVersion).toBe(2)
  expect(result.run.coverage?.filter((e) => e.outcome === 'skipped')).toHaveLength(2)
  expect(result.run.coverage?.filter((e) => e.outcome === 'failed')).toHaveLength(4)
  const ideal = result.run.tiles.find((tile) => tile.state === 'ideal')
  if (!ideal) throw new Error('Expected ideal capture')
  expect(ideal.accessibility?.violations.some((issue) => issue.id === 'html-has-lang')).toBe(true)
  expect(ideal.error).toBeUndefined()
  expect(ideal.stability).toBe('stable')
  expect(ideal.masks?.[0]?.boxes.length).toBe(1)
  expect(ideal.imageHash).toMatch(/^[a-f0-9]{64}$/)
  expect(readFileSync(join(result.dir, ideal.file)).length).toBeGreaterThan(100)
  expect(result.run.tiles.find((tile) => tile.state === 'timeout')?.diagnostic?.stage).toBe(
    'readiness',
  )
  expect(result.run.tiles.find((tile) => tile.state === 'bad-session')?.diagnostic?.stage).toBe(
    'context initialization',
  )
  expect(result.run.tiles.filter((tile) => tile.state === 'moving')).toHaveLength(2)
  expect(
    result.run.tiles
      .filter((tile) => tile.state === 'moving')
      .every((tile) => tile.stability === 'unstable'),
  ).toBe(true)
  expect(ideal.recipeHash).toMatch(/^[a-f0-9]{64}$/)
  expect(result.run.provenance?.manifestHash).toMatch(/^[a-f0-9]{64}$/)
}, 60000)

it('warns about large fixed overlays but not slim top headers, without flagging the tile', async () => {
  const result = await runCapture({
    root,
    baseUrl: base,
    concurrency: 1,
    manifest: {
      baseUrl: base,
      viewports: [390],
      themes: { light: 'light', dark: 'dark', method: 'media' },
      routes: [
        { path: '/overlay', states: [{ name: 'ideal' }] },
        { path: '/', states: [{ name: 'ideal' }] },
      ],
    },
  })
  const overlay = result.run.tiles.find((t) => t.route === '/overlay' && t.theme === 'light')
  const warnings = overlay?.warnings?.filter((w) => w.includes('overlay')) ?? []
  expect(warnings).toHaveLength(1)
  expect(warnings[0]).toMatch(
    /^Fixed overlay covers 36% of viewport: div\.cookie-consent "Cookies"\. Dismiss it/,
  )
  expect(overlay?.error).toBeUndefined()
  const plain = result.run.tiles.find((t) => t.route === '/' && t.theme === 'light')
  expect(plain?.warnings?.some((w) => w.includes('overlay'))).toBeFalsy()
  // A warning alone never flags a tile: same verdict as the overlay-free page.
  expect(overlay && isFlagged(overlay)).toBe(plain && isFlagged(plain))
}, 60000)

it('waits and retries the navigation once after an HTTP 429', async () => {
  const result = await runCapture({
    root,
    baseUrl: base,
    concurrency: 1,
    manifest: {
      baseUrl: base,
      viewports: [390],
      themes: { light: 'light', dark: 'dark', method: 'media' },
      routes: [{ path: '/rl', states: [{ name: 'ideal' }] }],
    },
  })
  const light = result.run.tiles.find((t) => t.theme === 'light')
  expect(light?.error).toBeUndefined()
  expect(light?.status).toBe(200)
  expect(rateLimitHits).toBe(3) // light: 429 then 200, dark: 200
}, 60000)
