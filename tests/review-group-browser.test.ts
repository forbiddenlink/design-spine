import { type ChildProcess, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { type Browser, chromium } from 'playwright'
import { PNG } from 'pngjs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const root = mkdtempSync(join(tmpdir(), 'spine-group-browser-'))
const runDir = join(root, '.design-spine/runs/a')
let child: ChildProcess | undefined
let browser: Browser | undefined
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

afterAll(async () => {
  await browser?.close()
  child?.kill()
  rmSync(root, { recursive: true, force: true })
})

const saved = () => JSON.parse(readFileSync(join(runDir, 'review.json'), 'utf8')).tiles

describe('group by cause in the review UI', () => {
  it('lists groups, expands members, and approves only after the dialog is confirmed', async () => {
    browser = await chromium.launch({ headless: true })
    const page = await browser.newPage({ viewport: { width: 1260, height: 900 } })
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(base)
    await page.getByText('Comparison ready', { exact: false }).waitFor({ timeout: 60000 })
    await page.getByRole('button', { name: 'Filters' }).click()
    await page.getByRole('button', { name: 'Group by cause' }).click()
    const group = page.locator('.group')
    await page.locator('.group').first().waitFor()
    expect(await group.count()).toBe(1)
    expect(await group.getByRole('heading').textContent()).toMatch(/^3 tiles, same change near top/)
    await group.locator('img').waitFor()
    await group.getByText('Show 3 tiles').click()
    expect(await group.locator('.group-members li').count()).toBe(3)

    // Cancel records nothing.
    await group.getByRole('button', { name: /^Approve group/ }).click()
    const dialog = page.getByRole('dialog', { name: 'Approve group' })
    await dialog.waitFor({ state: 'visible' })
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('group-note')
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await dialog.waitFor({ state: 'hidden' })
    expect(() => readFileSync(join(runDir, 'review.json'), 'utf8')).toThrow()

    await group.getByRole('button', { name: /^Approve group/ }).click()
    await dialog.getByLabel(/Note for every tile/).fill('Header font from dependency bump')
    await dialog.getByRole('button', { name: 'Approve tiles' }).click()
    await dialog.waitFor({ state: 'hidden' })
    const tiles = saved()
    expect(Object.keys(tiles).sort()).toEqual(['a', 'b', 'c'])
    for (const id of ['a', 'b', 'c']) {
      expect(tiles[id].decision).toBe('approve')
      expect(tiles[id].note).toBe('Header font from dependency bump')
    }
    expect(await group.getByRole('button', { name: /^Approve group/ }).isDisabled()).toBe(true)
    expect(errors).toEqual([])
  }, 120000)
})
