import { chromium } from 'playwright'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PNG } from 'pngjs'
import { startReviewServer } from '../src/lib/server.ts'
import { writeJson } from '../src/lib/runs.ts'

const source = JSON.parse(readFileSync('design-research/.design-spine/runs/2026-10-08T15-32-24-858Z/run.json', 'utf8'))
const root = 'design-research/.design-spine/runs/comparison-sandbox'
const dir = join(root, 'runs', 'review')
const baselines = join(root, 'baselines')
mkdirSync(baselines, { recursive: true })
mkdirSync(dir, { recursive: true })
const statuses = ['changed', 'unchanged', 'new', 'size-changed', 'unavailable', 'no-capture']
const tiles = source.tiles.slice(0, 6).map((tile: any, index: number) => ({ ...tile, id: statuses[index], route: '/' + statuses[index], file: statuses[index] + '.png', error: index === 5 ? 'Generated capture failure' : undefined }))
for (let index = 0; index < tiles.length; index++) {
  const tile = tiles[index]
  const buffer = readFileSync('design-research/.design-spine/runs/2026-10-08T15-32-24-858Z/' + source.tiles[index].file)
  if (index !== 5) writeFileSync(join(dir, tile.file), buffer)
  if (index !== 2 && index !== 5) writeFileSync(join(baselines, tile.file), buffer)
  if (index === 0) {
    const png = PNG.sync.read(buffer)
    for (let y = 20; y < 80; y++) for (let x = 20; x < 160; x++) { const offset = (y * png.width + x) * 4; png.data[offset] = 180; png.data[offset + 1] = 40; png.data[offset + 2] = 10 }
    writeFileSync(join(dir, tile.file), PNG.sync.write(png))
  }
  if (index === 3) { const png = PNG.sync.read(buffer); const shorter = new PNG({ width: png.width, height: png.height - 40 }); PNG.bitblt(png, shorter, 0, 0, shorter.width, shorter.height, 0, 0); writeFileSync(join(baselines, tile.file), PNG.sync.write(shorter)) }
  if (index === 4) writeFileSync(join(baselines, tile.file), 'Intentional invalid generated PNG')
}
writeJson(join(dir, 'run.json'), { ...source, id: 'comparison-sandbox', tiles })
writeJson(join(dir, 'review.json'), { tiles: {} })
writeJson(join(baselines, 'manifest.json'), { tiles: Object.fromEntries(tiles.map(t => [t.id, { run: 'generated-reference', approvedAt: '2026-10-08T16:00:00.000Z' }])) })
const server = startReviewServer(dir, 0)
const base = 'http://localhost:' + server.port
const browser = await chromium.launch()
const audits: unknown[] = []
const checks: { width: number; check: string; passed: boolean }[] = []
function check(width: number, name: string, passed: boolean): void { checks.push({ width, check: name, passed }); if (!passed) throw new Error(name) }
try {
  for (const width of [1280, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } })
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message))
    await page.goto(base)
    await page.locator('.tile').first().waitFor()
    await page.addScriptTag({ path: 'design-research/.tool-cache/_npx/1722e863ebfd623b/node_modules/axe-core/axe.min.js' })
    async function audit(view: string): Promise<void> {
      const result = await page.evaluate(async () => (window as any).axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice'] } }))
      audits.push({ width, view, violations: result.violations, incomplete: result.incomplete }); if (result.violations.length) console.log(JSON.stringify(result.violations, null, 2))
      check(width, view + ': accessibility', result.violations.length === 0)
    }
    await audit('review-light')
    await page.screenshot({ path: `design-research/screenshots/after/comparison-review-${width}.png`, fullPage: true })
    const data = await (await fetch(base + '/api/run')).json()
    check(width, 'all six comparison states match actual fixture evidence', statuses.every(status => data.comparison.tiles[status].status === status))
    const imageResponse = await fetch(base + data.comparison.tiles.changed.diffUrl)
    check(width, 'difference served as PNG', imageResponse.ok && imageResponse.headers.get('content-type') === 'image/png')
    check(width, 'unknown evidence path rejected', (await fetch(base + '/comparison/baseline/unknown')).status === 404)
    await page.getByRole('button', { name: 'Only changed', exact: true }).click()
    check(width, 'changed-only includes new, pixel and dimension changes', await page.locator('.tile').count() === 3)
    await page.getByRole('button', { name: 'Clear filters', exact: true }).click()
    await page.locator('.tile[data-id="changed"]').getByRole('button', { name: 'Inspect screenshot', exact: true }).click()
    await page.locator('#viewer-mode').selectOption('split')
    await page.locator('#baseline-image').evaluate((img: HTMLImageElement) => img.decode())
    await page.locator('#viewer-image').evaluate((img: HTMLImageElement) => img.decode())
    check(width, 'side by side shows both readable images', await page.locator('#baseline-pane').isVisible() && await page.locator('#viewer-image').isVisible())
    check(width, 'baseline provenance is visible', (await page.locator('#comparison-context').innerText()).includes('generated-reference'))
    await page.screenshot({ path: `design-research/screenshots/after/comparison-split-${width}.png` })
    await audit('split-light')
    await page.locator('#viewer-mode').selectOption('diff')
    await page.locator('#viewer-image').evaluate((img: HTMLImageElement) => img.decode())
    await page.screenshot({ path: `design-research/screenshots/after/comparison-diff-${width}.png` })
    await audit('diff-light')
    await page.emulateMedia({ colorScheme: 'dark' }); await page.waitForTimeout(250)
    for (const view of ['diff', 'split']) { await page.locator('#viewer-mode').selectOption(view); await audit(view + '-dark'); await page.screenshot({ path: `design-research/screenshots/after/comparison-${view}-dark-${width}.png` }) }
    await page.locator('#viewer-mode').selectOption('diff')
    await page.emulateMedia({ colorScheme: 'light' }); await page.waitForTimeout(250)
    check(width, 'difference view points to difference evidence', (await page.locator('#viewer-image').getAttribute('src'))?.startsWith('/comparison/diff/') === true)
    await page.getByRole('button', { name: 'Close', exact: true }).click()
    for (const status of ['new', 'size-changed', 'unavailable']) {
      await page.locator(`.tile[data-id="${status}"]`).getByRole('button', { name: 'Inspect screenshot', exact: true }).click()
      check(width, status + ': unavailable comparison modes disabled', await page.locator('#viewer-mode option[value="diff"]').evaluate((option: HTMLOptionElement) => option.disabled))
      await page.getByRole('button', { name: 'Close', exact: true }).click()
    }
    check(width, 'no page errors or horizontal overflow', errors.length === 0 && await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    await page.close()
  }
  writeFileSync('design-research/comparison-accessibility.json', JSON.stringify(audits, null, 2))
  writeFileSync('design-research/comparison-checks.json', JSON.stringify(checks, null, 2))
  console.log(checks.length + ' real-server comparison checks passed')
} finally { await browser.close(); server.stop() }
