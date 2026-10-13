import { type ChildProcess, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import AxeBuilder from '@axe-core/playwright'
import { type Browser, chromium } from 'playwright'
import { PNG } from 'pngjs'
import { expect, it } from 'vitest'

it('reviews original evidence, navigates changes, binds notes and protects drafts when switching runs', async () => {
  const root = mkdtempSync(join(tmpdir(), 'spine-review-browser-'))
  let child: ChildProcess | undefined
  let browser: Browser | undefined
  try {
    const runRoot = join(root, '.design-spine/runs')
    const baselines = join(root, '.design-spine/baselines')
    mkdirSync(baselines, { recursive: true })
    const base = new PNG({ width: 390, height: 2000 })
    base.data.fill(255)
    writeFileSync(join(baselines, 'tile.png'), PNG.sync.write(base))
    for (let y = 1900; y < 1910; y++)
      for (let x = 0; x < 10; x++) {
        const offset = (y * 390 + x) * 4
        base.data[offset] = 0
        base.data[offset + 1] = 0
        base.data[offset + 2] = 0
      }
    const bytes = PNG.sync.write(base)
    const tile = {
      id: 'tile',
      file: 'tile.png',
      route: '/',
      path: '/',
      state: 'default',
      viewport: 390,
      theme: 'light',
      status: 200,
      consoleErrors: [],
      pageErrors: [],
      brokenImages: [],
      overflowX: false,
      textClipped: [],
      blankRegions: { count: 0, boxes: [] },
      imageHash: createHash('sha256').update(bytes).digest('hex'),
    }
    for (const id of ['a', 'b']) {
      const dir = join(runRoot, id)
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, 'tile.png'), bytes)
      writeFileSync(
        join(dir, 'run.json'),
        JSON.stringify({
          id,
          baseUrl: 'http://example.test',
          tiles: [tile],
          coverage: [
            { ...tile, outcome: 'captured' },
            { ...tile, id: 'todo', state: 'empty', outcome: 'skipped', reason: 'Needs fixture' },
          ],
        }),
      )
    }
    const script = join(root, 'server.ts')
    writeFileSync(
      script,
      `import { startReviewServer } from ${JSON.stringify(resolve('src/lib/server.ts'))}; const server = startReviewServer(${JSON.stringify(join(runRoot, 'a'))}, 0); console.log('READY '+server.port);`,
    )
    child = process.env.SPINE_REVIEW_BIN
      ? spawn(
          resolve(process.env.SPINE_REVIEW_BIN),
          ['review', '--run', join(runRoot, 'a'), '--port', '0'],
          { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] },
        )
      : spawn('bun', [script], { stdio: ['ignore', 'pipe', 'pipe'] })
    const port = await new Promise<string>((res, rej) => {
      const timer = setTimeout(() => rej(new Error('Review server did not start')), 10000)
      child?.stdout?.on('data', (data) => {
        const match = String(data).match(/(?:READY |http:\/\/localhost:)(\d+)/)
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
    browser = await chromium.launch({ headless: true })
    const context = await browser.newContext({ viewport: { width: 1260, height: 800 } })
    const page = await context.newPage()
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    const url = `http://127.0.0.1:${port}`
    await page.goto(url)
    await page.getByText('1 of 2 planned tiles captured', { exact: false }).waitFor()
    await page.getByText('Comparison ready', { exact: false }).waitFor()
    await page.setViewportSize({ width: 1260, height: 700 })
    const thumb = await page.locator('.thumb').boundingBox()
    expect(thumb?.y).toBeLessThan(560)
    await page.getByRole('button', { name: /inspect screenshot/i }).click()
    expect(new URL(page.url()).searchParams.get('run')).toBe('a')
    expect(new URL(page.url()).searchParams.get('tile')).toBe('tile')
    expect(
      await page.locator('#viewer-close').evaluate((node) => node === document.activeElement),
    ).toBe(true)
    for (let index = 0; index < 35; index++) {
      await page.keyboard.press('Tab')
      const focused = await page.evaluate(() => ({
        inside: !!document.activeElement?.closest('#lightbox'),
        element: document.activeElement?.tagName,
        id: document.activeElement?.id,
        documentFocused: document.hasFocus(),
      }))
      // Native dialogs may hand focus to browser chrome; background page controls stay inert.
      expect(
        focused.inside || (!focused.documentFocused && focused.element === 'BODY'),
        `Tab step ${index}: ${JSON.stringify(focused)}`,
      ).toBe(true)
    }
    for (const width of [1260, 390]) {
      await page.setViewportSize({ width, height: 800 })
      const viewerAccessibility = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze()
      expect(viewerAccessibility.violations.map((issue) => issue.id)).toEqual([])
    }
    await page.keyboard.press('Escape')
    await page.waitForFunction(() => !new URL(location.href).searchParams.has('tile'))
    expect(
      await page
        .getByRole('button', { name: /inspect screenshot/i })
        .evaluate((node) => node === document.activeElement),
    ).toBe(true)
    await page.keyboard.press('Enter')
    await page.locator('#lightbox[open]').waitFor()
    await page.setViewportSize({ width: 1260, height: 700 })
    await page.locator('#viewer-image').evaluate((image: HTMLImageElement) => image.decode())
    await page.locator('#viewer-mode').selectOption('overlay')
    expect(await page.locator('#overlay-image').isVisible()).toBe(true)
    await page.locator('#blend').focus()
    await page.keyboard.press('ArrowRight')
    expect(await page.locator('#blend').inputValue()).toBe('51')
    await page.locator('#viewer-mode').selectOption('current')
    await page.locator('#change-region').selectOption('0')
    expect(await page.locator('.viewer-canvas').evaluate((node) => node.scrollTop)).toBeGreaterThan(
      100,
    )
    await page.getByRole('button', { name: 'Locate note on screenshot' }).click()
    await page.locator('#viewer-image').click({ position: { x: 30, y: 1940 } })
    await page.getByText(/Note location: \d+/).waitFor()
    expect(await page.locator('#note-overlay').isVisible()).toBe(true)
    await page.locator('.viewer-note').evaluate((details: HTMLDetailsElement) => {
      details.open = true
    })
    await page.locator('#viewer-note').fill('Bottom edge needs attention')
    await page.locator('#viewer-save-note').click()
    await page.getByText('Review note · saved', { exact: true }).waitFor()
    await page.locator('#viewer-close').click()
    await page.waitForFunction(() => !new URL(location.href).searchParams.has('tile'))
    const saved = JSON.parse(readFileSync(join(runRoot, 'a/review.json'), 'utf8'))
    expect(saved.tiles.tile.anchor.imageHash).toBe(tile.imageHash)
    expect(saved.tiles.tile.note).toBe('Bottom edge needs attention')
    await page.locator('.tile textarea').fill('Unsaved draft')
    expect(await page.locator('#run-select').isDisabled()).toBe(true)
    await page.locator('.tile textarea').blur()
    await page.waitForFunction(
      () => !(document.querySelector('#run-select') as HTMLSelectElement).disabled,
    )
    await page.route('**/api/run*', (route) =>
      new URL(route.request().url()).searchParams.get('run') === 'b'
        ? route.fulfill({ status: 503, body: 'Temporary failure' })
        : route.continue(),
    )
    await page.locator('#run-select').selectOption('b')
    await page.getByRole('heading', { name: 'Could not load this run.' }).waitFor()
    expect(await page.locator('#clear-filters').isDisabled()).toBe(true)
    expect(await page.locator('.tile').count()).toBe(0)
    await page.unroute('**/api/run*')
    await page.getByRole('button', { name: 'Retry loading' }).click()
    await page.waitForFunction(() => document.querySelector('#runid')?.textContent === 'b')
    expect(new URL(page.url()).searchParams.get('run')).toBe('b')
    const stale = await page.request.post(`${url}/api/review?run=b`, {
      data: { tileId: 'tile', anchor: { x: 1, y: 1, imageHash: 'a'.repeat(64) } },
    })
    expect(stale.status()).toBe(409)
    const hostile = await page.request.get(`${url}/api/runs`, { headers: { Host: 'evil.test' } })
    expect(hostile.status()).toBe(403)
    const crossOrigin = await page.request.post(`${url}/api/review`, {
      headers: { Origin: 'http://evil.test' },
      data: { tileId: 'tile', decision: 'approve' },
    })
    expect(crossOrigin.status()).toBe(403)
    const report = await page.request.get(`${url}/api/report?run=a`)
    expect((await report.text()).includes('Unsaved draft')).toBe(true)
    for (const width of [1260, 630, 390]) {
      await page.setViewportSize({ width, height: 800 })
      for (const colorScheme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        )
        const accessibility = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
          .analyze()
        expect(
          accessibility.violations.map((issue) => ({
            id: issue.id,
            targets: issue.nodes.map((node) => node.target),
          })),
        ).toEqual([])
        await page.evaluate(() => {
          window.scrollTo(0, 0)
          ;(document.activeElement as HTMLElement)?.blur()
        })
        if (process.env.SPINE_REVIEW_EVIDENCE) {
          mkdirSync(process.env.SPINE_REVIEW_EVIDENCE, { recursive: true })
          await page.screenshot({
            path: join(process.env.SPINE_REVIEW_EVIDENCE, `review-${width}-${colorScheme}.png`),
            fullPage: true,
          })
        }
      }
    }
    expect(errors).toEqual([])
  } finally {
    await browser?.close()
    child?.kill()
    rmSync(root, { recursive: true, force: true })
  }
}, 60000)
