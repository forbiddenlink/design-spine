import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PNG } from 'pngjs'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { runCapture } from '../src/lib/capture.ts'
import { flagReasons, isFlagged } from '../src/lib/runs.ts'
import type { Tile } from '../src/lib/types.ts'

const root = mkdtempSync(join(tmpdir(), 'spine-capture-browser-'))
let rateLimitHits = 0
const server = createServer((_req, res) => {
  res.setHeader('content-type', 'text/html')
  if (_req.url?.startsWith('/limited.js')) {
    res.statusCode = 429
    res.end('Rate limited')
    return
  }
  if (_req.url?.startsWith('/disconnect')) {
    _req.socket.destroy()
    return
  }
  if (_req.url === '/request-errors') {
    res.end(`<html><body><h1>Request diagnostics</h1>
      <script src="/limited.js?token=do-not-save#private"></script>
      <script>fetch('/disconnect?token=do-not-save').catch(()=>{})</script>
      <img src="/missing.png?X-Amz-Signature=do-not-save#private" alt="">
      <script>console.error('auth failed for http://127.0.0.1:9/cb?access_token=do-not-save')</script>
      </body></html>`)
    return
  }
  if (_req.url === '/request-burst') {
    res.end(`<html><body><h1>Bounded request diagnostics</h1><script>
      Promise.all(Array.from({length: 25}, (_, i) => fetch('/limited.js?token=private-' + i)))
        .then(() => document.body.dataset.ready = 'yes')
      </script></body></html>`)
    return
  }
  if (_req.url === '/wide') {
    res.end(`<html><head><meta name="viewport" content="width=device-width"></head><body style="margin:0">
      <main><h1>Wide</h1><div class="banner" style="width:600px;height:40px;background:#ddd"><span>inside</span></div>
      <div style="overflow-x:auto"><table style="width:900px"><tr><td>scrolls in its own box</td></tr></table></div>
      </main></body></html>`)
    return
  }
  if (_req.url === '/consent') {
    res.end(`<html><body><h1>Consent</h1><div id="cookie" style="position:fixed;bottom:0;left:0;right:0;height:300px;background:#ccc">Cookies</div>
      <script>if (localStorage.getItem('consent')) document.getElementById('cookie').remove()</script></body></html>`)
    return
  }
  if (_req.url === '/list') {
    res.end(`<html><body><ul id="list"></ul><script>
      setTimeout(() => { document.querySelector('#list').innerHTML = '<li class="item">a</li><li class="item">b</li><li class="item">c</li>' }, 200)
      </script></body></html>`)
    return
  }
  if (_req.url === '/mocked-error') {
    res.end(`<html><body><h1>Error state</h1><script>
      fetch('/api/data').finally(() => document.body.dataset.ready = 'yes')
      </script></body></html>`)
    return
  }
  if (_req.url?.startsWith('/slow-')) {
    setTimeout(() => res.end('late'), 1500)
    return
  }
  if (_req.url === '/prefetch-abort') {
    res.end(`<html><body><h1>Prefetch</h1><script>
      for (const [path, headers] of [['/slow-prefetch', {'Next-Router-Prefetch': '1'}], ['/slow-rsc', {RSC: '1'}], ['/slow-plain', {}]]) {
        const control = new AbortController()
        fetch(path, { headers, signal: control.signal }).catch(() => {})
        setTimeout(() => control.abort(), 60)
      }
      setTimeout(() => document.body.dataset.ready = 'yes', 300)
      </script></body></html>`)
    return
  }
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

it('records HTTP and transport failures with resource details and sanitized URLs', async () => {
  const result = await runCapture({
    root,
    baseUrl: base,
    concurrency: 1,
    manifest: {
      baseUrl: base,
      viewports: [390],
      themes: { light: 'light', dark: 'dark', method: 'media' },
      routes: [{ path: '/request-errors', states: [{ name: 'ideal' }] }],
    },
  })
  for (const tile of result.run.tiles) {
    expect(tile.status).toBe(200)
    expect(tile.error).toBeUndefined()
    expect(tile.requestErrors).toHaveLength(2)
    expect(tile.requestErrors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          url: `${base}/limited.js`,
          resourceType: 'script',
          status: 429,
          elapsedMs: expect.any(Number),
        }),
        expect.objectContaining({
          url: `${base}/disconnect`,
          resourceType: 'fetch',
          failure: 'net::ERR_EMPTY_RESPONSE',
          elapsedMs: expect.any(Number),
        }),
      ]),
    )
    expect(JSON.stringify(tile.requestErrors)).not.toMatch(/do-not-save|private|token/)
    // App-generated text outside requestErrors carries URLs too: a logged callback and a
    // signed image source must not reach run.json with their query strings.
    expect(tile.consoleErrors).toContain('auth failed for http://127.0.0.1:9/cb')
    expect(tile.brokenImages).toEqual([`${base}/missing.png`])
    expect(JSON.stringify(result.run)).not.toMatch(/do-not-save|private|access_token|Signature/)
    expect(tile.requestErrors?.every((error) => error.elapsedMs >= 0)).toBe(true)
    expect(
      isFlagged({
        ...tile,
        consoleErrors: [],
        pageErrors: [],
        brokenImages: [],
        blankRegions: { count: 0, boxes: [] },
      }),
    ).toBe(true)
  }
}, 30000)

it('bounds request diagnostics and retains them when readiness fails', async () => {
  const result = await runCapture({
    root,
    baseUrl: base,
    concurrency: 1,
    manifest: {
      baseUrl: base,
      viewports: [390],
      themes: { light: 'light', dark: 'dark', method: 'media' },
      routes: [
        {
          path: '/request-burst',
          states: [
            {
              name: 'timeout',
              steps: [{ action: 'wait', selector: 'body[data-ready="yes"]' }],
              ready: { selector: '#never', timeoutMs: 50 },
            },
          ],
        },
      ],
    },
  })
  for (const tile of result.run.tiles) {
    expect(tile.diagnostic?.stage).toBe('readiness')
    expect(tile.requestErrors).toHaveLength(20)
    expect(
      tile.requestErrors?.every(
        (error) => error.status === 429 && error.url === `${base}/limited.js`,
      ),
    ).toBe(true)
    expect(readFileSync(join(result.dir, 'run.json'), 'utf8')).not.toContain('private-')
  }
}, 30000)

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
  // The retry recovered, so the first attempt's 429 is not a failure of this screen.
  expect(light?.requestErrors).toEqual([])
  expect(rateLimitHits).toBe(3) // light: 429 then 200, dark: 200
}, 60000)

it('does not report a state mock as a failed request', async () => {
  const result = await runCapture({
    root,
    baseUrl: base,
    concurrency: 1,
    manifest: {
      baseUrl: base,
      viewports: [390],
      themes: { light: 'light', dark: 'dark', method: 'media' },
      routes: [
        {
          path: '/mocked-error',
          states: [
            {
              name: 'error',
              responses: [{ url: '**/api/data', status: 500, body: 'boom' }],
              ready: { selector: 'body[data-ready="yes"]' },
            },
          ],
        },
      ],
    },
  })
  for (const tile of result.run.tiles) {
    expect(tile.error).toBeUndefined()
    // The author asked for this 500 to render the error state; it is not a defect.
    expect(tile.requestErrors).toEqual([])
    // Nor is the browser's "Failed to load resource" console message for that same response.
    expect(tile.consoleErrors).toEqual([])
    expect(isFlagged(tile)).toBe(false)
  }
}, 60000)

it('ignores a router aborting its own prefetch but still reports other aborted requests', async () => {
  const result = await runCapture({
    root,
    baseUrl: base,
    concurrency: 1,
    manifest: {
      baseUrl: base,
      viewports: [390],
      themes: { light: 'light', dark: 'dark', method: 'media' },
      routes: [
        {
          path: '/prefetch-abort',
          states: [{ name: 'ideal', ready: { selector: 'body[data-ready="yes"]' } }],
        },
      ],
    },
  })
  for (const tile of result.run.tiles) {
    expect(tile.error).toBeUndefined()
    expect(
      tile.requestErrors?.map((error) => [new URL(error.url).pathname, error.failure]),
    ).toEqual([['/slow-plain', 'net::ERR_ABORTED']])
  }
}, 60000)

it('names the outermost element that overflows, ignoring content that scrolls in its own box', async () => {
  const result = await runCapture({
    root,
    baseUrl: base,
    concurrency: 1,
    manifest: {
      baseUrl: base,
      viewports: [390],
      themes: { light: 'light', dark: 'dark', method: 'media' },
      routes: [{ path: '/wide', states: [{ name: 'ideal' }] }],
    },
  })
  const tile = result.run.tiles[0]
  expect(tile?.overflowX).toBe(true)
  expect(tile?.overflowOffenders?.map((o) => o.selector)).toEqual(['div.banner'])
  expect(tile?.overflowOffenders?.[0]?.box).toMatchObject({ x: 0, w: 600, h: 40 })
  expect(flagReasons(tile as Tile)).toContain('horizontal overflow from div.banner (600px wide)')
}, 60000)

it('treats a ready selector that matches several elements as ready once the first shows', async () => {
  const result = await runCapture({
    root,
    baseUrl: base,
    concurrency: 1,
    manifest: {
      baseUrl: base,
      viewports: [390],
      themes: { light: 'light', dark: 'dark', method: 'media' },
      routes: [{ path: '/list', states: [{ name: 'ideal', ready: { selector: '.item' } }] }],
    },
  })
  for (const tile of result.run.tiles) expect(tile.error).toBeUndefined()
}, 60000)

it('warns when a dark capture is identical to light because the theme never applied', async () => {
  const result = await runCapture({
    root,
    baseUrl: base,
    concurrency: 2,
    manifest: {
      baseUrl: base,
      viewports: [390],
      // The fixture page has no dark styles, so emulating the media query changes nothing.
      themes: { light: 'light', dark: 'dark', method: 'media' },
      routes: [{ path: '/list', states: [{ name: 'ideal' }] }],
    },
  })
  const dark = result.run.tiles.find((t) => t.theme === 'dark')
  const light = result.run.tiles.find((t) => t.theme === 'light')
  expect(dark?.warnings?.some((w) => w.startsWith('Dark capture is identical'))).toBe(true)
  expect(light?.warnings ?? []).toEqual([])
  expect(isFlagged(dark as Tile)).toBe(false)
}, 60000)

it('lets a state replace the manifest initScripts, such as showing a dismissed cookie banner', async () => {
  const result = await runCapture({
    root,
    baseUrl: base,
    concurrency: 1,
    manifest: {
      baseUrl: base,
      viewports: [390],
      themes: { light: 'light', dark: 'dark', method: 'media' },
      initScripts: [{ localStorage: { consent: '1' } }],
      routes: [
        {
          path: '/consent',
          states: [{ name: 'ideal' }, { name: 'banner', initScripts: [] }],
        },
      ],
    },
  })
  const overlay = (state: string) =>
    result.run.tiles
      .filter((t) => t.state === state && t.theme === 'light')
      .flatMap((t) => t.warnings ?? [])
      .some((w) => w.includes('overlay covers'))
  expect(overlay('ideal')).toBe(false)
  expect(overlay('banner')).toBe(true)
  const [ideal, banner] = ['ideal', 'banner'].map(
    (state) => result.run.tiles.find((t) => t.state === state)?.recipeHash,
  )
  expect(ideal).not.toBe(banner)
}, 60000)

it('captures at a device scale factor and keeps outlines and masks in image pixels', async () => {
  const result = await runCapture({
    root,
    baseUrl: base,
    concurrency: 1,
    manifest: {
      baseUrl: base,
      viewports: [390],
      themes: { light: 'light', dark: 'dark', method: 'media' },
      capture: { deviceScaleFactor: 2 },
      routes: [
        {
          path: '/wide',
          states: [{ name: 'ideal', masks: [{ selector: 'h1', reason: 'heading' }] }],
        },
      ],
    },
  })
  const tile = result.run.tiles.find((t) => t.theme === 'light')
  const png = PNG.sync.read(readFileSync(join(result.dir, tile?.file as string)))
  // 600 CSS px of overflowing banner, rendered at 2x.
  expect(png.width).toBeGreaterThanOrEqual(1200)
  expect(tile?.overflowOffenders?.[0]).toMatchObject({ cssWidth: 600, box: { w: 1200, h: 80 } })
  expect(flagReasons(tile as Tile)).toContain('horizontal overflow from div.banner (600px wide)')
  const heading = tile?.masks?.[0]?.boxes[0]
  expect(heading && heading.y + heading.h).toBeLessThanOrEqual(png.height)
  expect(heading?.w).toBeGreaterThan(390)
  expect(result.run.provenance?.policy.deviceScaleFactor).toBe(2)
}, 60000)

it('records an accessibility-tree snapshot beside each screenshot when asked', async () => {
  const result = await runCapture({
    root,
    baseUrl: base,
    concurrency: 1,
    manifest: {
      baseUrl: base,
      viewports: [390],
      themes: { light: 'light', dark: 'dark', method: 'media' },
      capture: { ariaSnapshots: true },
      routes: [{ path: '/consent', states: [{ name: 'ideal' }] }],
    },
  })
  const tile = result.run.tiles.find((t) => t.theme === 'light')
  const aria = readFileSync(join(result.dir, 'consent__ideal__390__light.aria.yml'), 'utf8')
  expect(aria).toContain('heading "Consent" [level=1]')
  expect(tile?.ariaHash).toMatch(/^[0-9a-f]{64}$/)
}, 60000)

it('captures generated stress states: zoom keeps pixel width, RTL and long text change the page', async () => {
  const result = await runCapture({
    root,
    baseUrl: base,
    concurrency: 2,
    manifest: {
      baseUrl: base,
      viewports: [390],
      themes: { light: 'light', dark: 'dark', method: 'media' },
      capture: { stress: ['zoom-200', 'rtl', 'long-text'], ariaSnapshots: true },
      routes: [{ path: '/consent', states: [{ name: 'ideal', initScripts: [] }] }],
    },
  })
  const light = (state: string) =>
    result.run.tiles.find((t) => t.state === state && t.theme === 'light') as Tile
  const png = (state: string) => PNG.sync.read(readFileSync(join(result.dir, light(state).file)))
  for (const state of ['ideal', 'stress-zoom-200', 'stress-rtl', 'stress-long-text'])
    expect(light(state).error).toBeUndefined()
  expect(png('stress-zoom-200').width).toBe(390)
  const hashes = new Set(
    ['ideal', 'stress-zoom-200', 'stress-rtl', 'stress-long-text'].map((s) => light(s).imageHash),
  )
  expect(hashes.size).toBe(4)
  const aria = readFileSync(
    join(result.dir, light('stress-long-text').file.replace('.png', '.aria.yml')),
    'utf8',
  )
  expect(aria).toContain('Çöñšéñt')
  // In RTL the heading starts at the right edge: its leftmost dark pixel moves right.
  const firstInk = (image: PNG): number => {
    for (let x = 0; x < image.width; x++)
      for (let y = 0; y < 80; y++)
        if ((image.data[(y * image.width + x) * 4] ?? 255) < 100) return x
    return -1
  }
  expect(firstInk(png('stress-rtl'))).toBeGreaterThan(firstInk(png('ideal')) + 100)
}, 90000)
