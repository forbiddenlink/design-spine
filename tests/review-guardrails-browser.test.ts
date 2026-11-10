import { type ChildProcess, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import AxeBuilder from '@axe-core/playwright'
import { type Browser, chromium } from 'playwright'
import { PNG } from 'pngjs'
import { afterAll, beforeAll, expect, it } from 'vitest'

// One clean tile identical to its approved baseline, one changed clean tile, and one flagged tile
// whose overflow culprit was recorded. Covers the review guardrails added together.
const root = mkdtempSync(join(tmpdir(), 'spine-guardrails-'))
const dir = join(root, '.design-spine/runs/r1')
const baselines = join(root, '.design-spine/baselines')
let child: ChildProcess | undefined
let browser: Browser | undefined
let url = ''

function png(width: number, shade: number): Buffer {
  const image = new PNG({ width, height: 300 })
  for (let i = 0; i < image.data.length; i += 4) {
    image.data[i] = image.data[i + 1] = image.data[i + 2] = shade
    image.data[i + 3] = 255
  }
  return PNG.sync.write(image)
}
const base = {
  route: '/',
  path: '/',
  viewport: 390,
  theme: 'light',
  status: 200,
  consoleErrors: [],
  pageErrors: [],
  brokenImages: [],
  textClipped: [],
  overflowX: false,
  blankRegions: { count: 0, boxes: [] },
}

beforeAll(async () => {
  mkdirSync(dir, { recursive: true })
  mkdirSync(baselines, { recursive: true })
  const same = png(390, 240)
  const wide = png(600, 230)
  writeFileSync(join(dir, 'same.png'), same)
  writeFileSync(join(baselines, 'same.png'), same)
  writeFileSync(join(dir, 'changed.png'), png(390, 120))
  writeFileSync(join(baselines, 'changed.png'), png(390, 250))
  writeFileSync(join(dir, 'wide.png'), wide)
  const hash = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex')
  const tiles = [
    { ...base, id: 'same', file: 'same.png', state: 'same', imageHash: hash(same) },
    {
      ...base,
      id: 'changed',
      file: 'changed.png',
      state: 'changed',
      imageHash: hash(readFileSync(join(dir, 'changed.png'))),
    },
    {
      ...base,
      id: 'wide',
      file: 'wide.png',
      state: 'wide',
      imageHash: hash(wide),
      overflowX: true,
      overflowOffenders: [{ selector: 'div.banner', box: { x: 0, y: 40, w: 600, h: 40 } }],
    },
  ]
  writeFileSync(
    join(dir, 'run.json'),
    JSON.stringify({
      id: 'r1',
      baseUrl: 'http://example.test',
      tiles,
      coverage: tiles.map((t) => ({ ...t, outcome: 'captured' })),
    }),
  )
  const script = join(root, 'server.ts')
  writeFileSync(
    script,
    `import { startReviewServer } from ${JSON.stringify(resolve('src/lib/server.ts'))}; const s = startReviewServer(${JSON.stringify(dir)}, 0); console.log('READY ' + s.port);`,
  )
  child = spawn('bun', [script], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] })
  const port = await new Promise<string>((done, fail) => {
    const timer = setTimeout(() => fail(new Error('server timed out')), 15000)
    child?.stdout?.on('data', (data) => {
      const match = String(data).match(/READY (\d+)/)
      if (match?.[1]) {
        clearTimeout(timer)
        done(match[1])
      }
    })
  })
  url = `http://127.0.0.1:${port}`
  browser = await chromium.launch()
}, 30000)

afterAll(async () => {
  await browser?.close()
  child?.kill()
  rmSync(root, { recursive: true, force: true })
})

it('keeps identical captures out of the queue, needs a reason to approve findings, and undoes', async () => {
  const page = await (
    await (browser as Browser).newContext({ viewport: { width: 1260, height: 900 } })
  ).newPage()
  page.setDefaultTimeout(5000)
  await page.goto(url)
  await page.getByText('Comparison ready', { exact: false }).waitFor()
  const card = (id: string) => page.locator(`.tile[data-id="${id}"]`)
  await expect.poll(() => card('same').locator('.head').textContent()).toContain('Matches baseline')
  expect(await page.locator('.stat.pending b').textContent()).toBe('2')
  expect(await page.locator('#progress-label').textContent()).toContain('1 of 3')

  // Approving a flagged screen without a note opens the note instead of saving.
  await card('wide').focus()
  await page.keyboard.press('a')
  await expect.poll(() => page.locator('#save-status').textContent()).toContain('has findings')
  expect(await card('wide').locator('.head').textContent()).toContain('Pending')
  const note = card('wide').locator('textarea')
  expect(await note.evaluate((node) => node === document.activeElement)).toBe(true)
  await note.fill('Banner is a known third-party embed; fixed in #41.')
  await card('wide').getByRole('button', { name: 'Approve wide' }).click()
  await expect.poll(() => card('wide').locator('.head').textContent()).toContain('Approved')
  const saved = JSON.parse(readFileSync(join(dir, 'review.json'), 'utf8'))
  expect(saved.tiles.wide).toMatchObject({
    decision: 'approve',
    note: expect.stringContaining('embed'),
  })

  // u steps the last decision back.
  await card('wide').focus()
  await page.keyboard.press('u')
  await expect.poll(() => card('wide').locator('.head').textContent()).toContain('Pending')

  // The server holds the same line for clients that skip the UI.
  const cleanApprove = await page.evaluate(async () => {
    const response = await fetch('/api/review', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tileId: 'changed', decision: 'approve', note: '' }),
    })
    return response.status
  })
  expect(cleanApprove).toBe(200)
  const blocked = await page.evaluate(async () => {
    await fetch('/api/review', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tileId: 'wide', note: '' }),
    })
    const response = await fetch('/api/review', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tileId: 'wide', decision: 'approve' }),
    })
    return { status: response.status, body: await response.json() }
  })
  expect(blocked.status).toBe(422)
  expect(blocked.body.error).toContain('horizontal overflow from div.banner (600px wide)')
  await page.close()
}, 60000)

it('lists findings in the inspector and outlines the overflowing element', async () => {
  const page = await (
    await (browser as Browser).newContext({ viewport: { width: 1260, height: 900 } })
  ).newPage()
  page.setDefaultTimeout(5000)
  await page.goto(`${url}/?tile=wide`)
  await page.locator('#lightbox[open]').waitFor()
  expect(await page.locator('#viewer-findings li').allTextContents()).toContain(
    'Horizontal overflow from div.banner (600px wide)',
  )
  await page
    .locator('#viewer-image')
    .evaluate((img: HTMLImageElement) =>
      img.complete ? null : new Promise((done) => img.addEventListener('load', done)),
    )
  await page.locator('#viewer-regions').click()
  expect(await page.locator('#viewer-regions').textContent()).toBe('Hide findings')
  expect(await page.locator('#diagnostic-overlay rect.overflow').count()).toBe(1)
  expect(await page.locator('#viewer-region option').allTextContents()).toContain(
    'Wider than the viewport: div.banner',
  )
  // Close is no longer the primary action; Approve is.
  expect(await page.locator('#viewer-close').getAttribute('class')).toBe('button')
  expect(await page.locator('#viewer-approve').getAttribute('class')).toContain('primary')
  const audit = await new AxeBuilder({ page }).include('#lightbox').analyze()
  expect(audit.violations.map((v) => v.id)).toEqual([])
  await page.close()
}, 60000)

it('keeps filters in the URL across a reload', async () => {
  const page = await (
    await (browser as Browser).newContext({ viewport: { width: 1260, height: 900 } })
  ).newPage()
  page.setDefaultTimeout(5000)
  await page.goto(url)
  await page.getByText('Comparison ready', { exact: false }).waitFor()
  await page.locator('#f-flagged').click()
  await page.locator('#search').fill('wide')
  // page.url() trails history.replaceState; read the address the page itself sees.
  const params = async () => new URL(await page.evaluate(() => location.href)).searchParams
  expect((await params()).get('flagged')).toBe('1')
  expect((await params()).get('q')).toBe('wide')
  await page.reload()
  await page.getByText('Comparison ready', { exact: false }).waitFor()
  expect(await page.locator('#f-flagged').getAttribute('aria-pressed')).toBe('true')
  expect(await page.locator('#search').inputValue()).toBe('wide')
  expect(await page.locator('.tile').count()).toBe(1)
  await page.locator('#clear-filters').click()
  expect((await params()).has('flagged')).toBe(false)
  await page.close()
}, 60000)

it('flashes the baseline in place while B is held', async () => {
  const page = await (
    await (browser as Browser).newContext({ viewport: { width: 1260, height: 900 } })
  ).newPage()
  page.setDefaultTimeout(5000)
  await page.goto(`${url}/?tile=changed`)
  await page.locator('#lightbox[open]').waitFor()
  await expect.poll(() => page.locator('#comparison-context').textContent()).toContain('hold B')
  const current = await page.locator('#viewer-image').getAttribute('src')
  await page.locator('.viewer-canvas').focus()
  await page.keyboard.down('b')
  expect(await page.locator('#viewer-image').getAttribute('src')).toContain('/comparison/baseline/')
  expect(await page.locator('#current-caption').textContent()).toContain('Baseline')
  await page.keyboard.up('b')
  expect(await page.locator('#viewer-image').getAttribute('src')).toBe(current)
  expect(await page.locator('#current-caption').textContent()).toBe('Current')
  await page.close()
}, 60000)
