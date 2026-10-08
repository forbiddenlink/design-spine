import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { chromium } from 'playwright'
import { startReviewServer } from '../src/lib/server.ts'
import { writeJson } from '../src/lib/runs.ts'

const sourceDir = 'design-research/.design-spine/runs/2026-10-08T15-32-24-858Z'
const source = JSON.parse(readFileSync(join(sourceDir, 'run.json'), 'utf8'))
mkdirSync('functional-review/evidence/.design-spine/runs', { recursive: true })
const root = mkdtempSync(join(process.cwd(), 'functional-review/evidence/.design-spine/runs/viewer-'))
const dir = join(root, 'runs/review'); const baseline = join(root, 'baselines'); mkdirSync(dir, { recursive: true }); mkdirSync(baseline)
const tile = { ...source.tiles.find((t: any) => t.blankRegions.boxes.length > 0), id: 'diagnostic', file: 'diagnostic.png' }
if (!tile.blankRegions?.boxes.length) throw new Error('Owned diagnostic fixture required')
const original = source.tiles.find((t: any) => t.route === tile.route && t.viewport === tile.viewport && t.theme === tile.theme)
const png = readFileSync(join(sourceDir, original.file)); writeFileSync(join(dir, tile.file), png); writeFileSync(join(baseline, tile.file), png)
writeJson(join(dir, 'run.json'), { ...source, id: 'viewer-audit', tiles: [tile] })
writeJson(join(baseline, 'manifest.json'), { tiles: { diagnostic: { run: 'owned-fixture', approvedAt: source.finishedAt } } })
const server = startReviewServer(dir, 0); const base = `http://localhost:${server.port}`
const browser = await chromium.launch()
const checks: unknown[] = []; const audits: unknown[] = []
const check = (name: string, passed: boolean): void => { checks.push({ name, passed }); if (!passed) throw new Error(name) }
try {
  for (const width of [1280, 390]) for (const theme of ['light', 'dark'] as const) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, colorScheme: theme })
    page.on('response', response => { if (response.status() >= 400) console.log('HTTP', response.status(), response.url()) });
    const errors: string[] = []; page.on('pageerror', e => { errors.push(e.message); console.log('PAGE ERROR', e.message) })
    if (theme === 'light') {
      const oldHtml = spawnSync('git', ['show', 'HEAD:src/ui/index.html'], { encoding: 'utf8' }).stdout
      await page.route(base + '/', route => route.fulfill({ contentType: 'text/html', body: oldHtml }))
      await page.goto(base); await page.locator('.tile').first().waitFor()
      await page.getByRole('button', { name: 'Inspect screenshot', exact: true }).click()
      await page.waitForFunction(() => { const img = document.querySelector<HTMLImageElement>('#viewer-image'); return img?.complete && img.naturalWidth && !img.hidden }, null, { timeout: 5000 })
      await page.screenshot({ path: `functional-review/evidence/viewer-before-${width}.png` })
      await page.unroute(base + '/')
    }
    await page.goto(base); await page.locator('.tile').first().waitFor()
    await page.waitForFunction(() => document.querySelector('#comparison-status')?.textContent?.startsWith('Comparison ready'))
    await page.route('**/api/review', route => route.fulfill({ status: 503, body: 'Generated save outage' }));
    const note = page.locator('textarea'); await note.fill('Unsaved generated note survives refresh')
    await page.getByRole('button', { name: 'Inspect screenshot', exact: true }).click()
    await page.waitForFunction(() => { const img = document.querySelector<HTMLImageElement>('#viewer-image'); return img?.complete && img.naturalWidth && !img.hidden }, null, { timeout: 5000 })
    await page.getByRole('button', { name: 'Show blank regions', exact: true }).click()
    check(`${width}/${theme}: recorded boxes rendered`, await page.locator('#diagnostic-overlay rect').count() === tile.blankRegions.boxes.length)
    const aligned = await page.evaluate(() => {
      const image = document.querySelector<HTMLImageElement>('#viewer-image')!; const overlay = document.querySelector('#diagnostic-overlay')!;
      const i = image.getBoundingClientRect(); const o = overlay.getBoundingClientRect();
      return Math.abs(i.x - o.x) < 1 && Math.abs(i.y - o.y) < 1 && Math.abs(i.width - o.width) < 1 && Math.abs(i.height - o.height) < 1
    })
    check(`${width}/${theme}: overlay fits image exactly`, aligned)
    await page.locator('#viewer-region').selectOption('0')
    await page.screenshot({ path: `functional-review/evidence/viewer-highlight-${theme}-${width}.png` })
    await page.getByRole('button', { name: 'Actual size', exact: true }).click()
    check(`${width}/${theme}: actual dimensions preserved`, await page.locator('#viewer-image').evaluate((img: HTMLImageElement) => Math.abs(img.getBoundingClientRect().width - img.naturalWidth) < 1))
    await page.getByRole('button', { name: 'Fit to width', exact: true }).click()
    await page.locator('#viewer-mode').selectOption('baseline')
    check(`${width}/${theme}: current diagnostics excluded from baseline`, await page.locator('#diagnostic-overlay').isHidden() && await page.locator('#viewer-regions').isDisabled())
    await page.waitForFunction(() => { const img = document.querySelector<HTMLImageElement>('#viewer-image'); return img?.complete && img.naturalWidth && !img.hidden }, null, { timeout: 5000 })
    const expired = await page.locator('#viewer-image').getAttribute('src')
    for (let i = 0; i < 5; i++) await fetch(base + '/api/comparison')
    check(`${width}/${theme}: old snapshot expires`, (await fetch(base + expired)).status === 404)
    await page.locator('#viewer-mode').selectOption('current'); await page.waitForFunction(() => { const img = document.querySelector<HTMLImageElement>('#viewer-image'); return img?.complete && img.naturalWidth && !img.hidden }, null, { timeout: 5000 })
    await page.locator('#viewer-mode').selectOption('baseline'); await page.locator('#viewer-error').waitFor({ state: 'visible' })
    check(`${width}/${theme}: expired download disabled`, await page.locator('#viewer-download').getAttribute('href') === null && await page.locator('#viewer-download').getAttribute('aria-disabled') === 'true')
    await page.getByRole('button', { name: 'Refresh evidence', exact: true }).click()
    await page.waitForFunction(() => { const image = document.querySelector<HTMLImageElement>('#viewer-image'); return image?.complete && image.naturalWidth && !image.hidden && document.querySelector<HTMLElement>('#viewer-error')?.hidden })
    check(`${width}/${theme}: refreshed download restored`, (await page.locator('#viewer-download').getAttribute('href'))?.startsWith('http://localhost:') === true && await page.locator('#viewer-download').getAttribute('aria-disabled') === 'false')
    check(`${width}/${theme}: refresh replaces expired URL`, await page.locator('#viewer-image').getAttribute('src') !== expired)
    await page.locator('#viewer-mode').selectOption('current'); await page.waitForFunction(() => { const img = document.querySelector<HTMLImageElement>('#viewer-image'); return img?.complete && img.naturalWidth && !img.hidden }, null, { timeout: 5000 })
    await page.addScriptTag({ path: 'design-research/.tool-cache/_npx/1722e863ebfd623b/node_modules/axe-core/axe.min.js' })
    const audit = await page.evaluate(async () => (window as any).axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice'] } }))
    audits.push({ width, theme, violations: audit.violations, incomplete: audit.incomplete }); check(`${width}/${theme}: axe`, audit.violations.length === 0)
    await page.keyboard.press('Escape')
    check(`${width}/${theme}: Escape restores initiating focus`, await page.getByRole('button', { name: 'Inspect screenshot', exact: true }).evaluate(el => el === document.activeElement))
    check(`${width}/${theme}: unsaved note retained`, await note.inputValue() === 'Unsaved generated note survives refresh')
    check(`${width}/${theme}: no errors or horizontal overflow`, errors.length === 0 && await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    await page.close()
  }
} finally { await browser.close(); server.stop() }
writeJson('functional-review/evidence/viewer-checks.json', checks); writeJson('functional-review/evidence/viewer-accessibility.json', audits)
console.log(`${checks.length} viewer checks passed`)
