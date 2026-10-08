import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'
const base = 'http://localhost:14850'
const source = await (await fetch(base + '/api/run')).json()
const browser = await chromium.launch()
const checks: { width: number; check: string; passed: boolean }[] = []
function check(width: number, name: string, passed: boolean): void { checks.push({ width, check: name, passed }); if (!passed) throw new Error(name) }
try {
 for (const width of [1280, 390]) {
  const page = await browser.newPage({ viewport: { width, height: 900 } })
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message))
  const tiles = Array.from({ length: 1000 }, (_, index) => ({ ...source.run.tiles[0], id: 'page-' + index, route: '/route-' + String(Math.floor(index / 20)).padStart(3, '0') }))
  const review: Record<string, any> = {}; let fail = true
  await page.route('**/api/run*', route => route.fulfill({ json: { ...source, run: { ...source.run, tiles }, review: { tiles: review }, comparison: { threshold: 0.002, tiles: Object.fromEntries(tiles.map(t => [t.id, { status: 'new' }])) } } }))
  await page.route('**/api/review', route => { const patch = route.request().postDataJSON(); if (fail) return route.fulfill({ status: 500, json: { error: 'Generated failure' } }); review[patch.tileId] = { decision: null, note: '', ...review[patch.tileId], ...patch }; return route.fulfill({ json: review[patch.tileId] }) })
  await page.goto(base); await page.locator('.tile').first().waitFor()
  check(width, 'bounded render and accurate page count', await page.locator('.tile').count() === 48 && (await page.locator('#page-label').innerText()).includes('Page 1 of 21'))
  const note = page.getByRole('textbox', { name: 'Review note for page-0', exact: true }); await note.fill('Draft survives page changes'); await note.press('Tab'); await page.locator('#save-status.error').waitFor()
  await page.locator('#pagination').getByRole('button', { name: 'Next page', exact: true }).click()
  check(width, 'next page renders and focuses first capture', await page.locator('.tile[data-id="page-48"]').isVisible() && await page.locator('.tile[data-id="page-48"]').evaluate(element => document.activeElement === element))
  await page.screenshot({ path: `functional-review/evidence/regression/paging-${width}.png` })
  await page.locator('#pagination').getByRole('button', { name: 'Previous page', exact: true }).click()
  check(width, 'failed draft survives pagination', await page.getByRole('textbox', { name: 'Review note for page-0', exact: true }).inputValue() === 'Draft survives page changes')
  fail = false; await page.getByRole('button', { name: 'Retry unsaved changes', exact: true }).click(); await page.waitForFunction(() => !(document.querySelector('#export') as HTMLButtonElement).disabled)
  check(width, 'retry confirms draft before export', !await page.getByRole('button', { name: 'Export review' }).isDisabled() && review['page-0'].note === 'Draft survives page changes')
  await page.locator('.tile[data-id="page-47"]').focus(); await page.keyboard.press('j')
  check(width, 'keyboard crosses forward page boundary', await page.locator('.tile[data-id="page-48"]').evaluate(element => document.activeElement === element))
  await page.keyboard.press('k')
  check(width, 'keyboard crosses backward page boundary', await page.locator('.tile[data-id="page-47"]').evaluate(element => document.activeElement === element))
  await page.locator('.tile[data-id="page-47"]').getByRole('button', { name: 'Inspect screenshot', exact: true }).click(); await page.getByRole('button', { name: 'Next screenshot' }).click()
  check(width, 'viewer navigates beyond rendered page', (await page.locator('#viewer-position').innerText()).includes('49 of 1000'))
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await page.getByRole('navigation', { name: 'Captured routes' }).getByRole('link', { name: '/route-049', exact: false }).click()
  check(width, 'route index opens page containing requested route', await page.locator('.tile[data-id="page-980"]').isVisible() && (await page.locator('#page-label').innerText()).includes('Page 21 of 21'))
  await page.getByRole('searchbox').fill('route-000')
  check(width, 'filter resets page and hides unnecessary pagination', await page.locator('.tile').count() === 20 && !await page.locator('#pagination').isVisible())
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click()
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export review' }).click(); const file = await download; const path = await file.path(); const report = await Bun.file(path!).json()
  check(width, 'export retains entire library, not just current page', report.run.tiles.length === 1000 && report.review.tiles['page-0'].note === 'Draft survives page changes')
  await page.addScriptTag({ path: 'design-research/.tool-cache/_npx/1722e863ebfd623b/node_modules/axe-core/axe.min.js' })
  for (const theme of ['light', 'dark'] as const) { await page.emulateMedia({ colorScheme: theme }); await page.waitForTimeout(250); const result = await page.evaluate(async () => (window as any).axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })); check(width, theme + ': no accessibility violations', result.violations.length === 0) }
  check(width, 'no uncaught errors or horizontal overflow', !errors.length && await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  await page.close()
 }
 writeFileSync('functional-review/evidence/paging-checks.json', JSON.stringify(checks, null, 2)); console.log(checks.length + ' paging checks passed')
} finally { await browser.close() }
