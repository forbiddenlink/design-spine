import { chromium, type Page } from 'playwright'
import { writeFileSync } from 'node:fs'

const browser = await chromium.launch()
const base = 'http://localhost:14850'
const fixture = await (await fetch(base + '/api/run')).json()
const results: { width: number; check: string; passed: boolean }[] = []
function check(width: number, label: string, passed: boolean): void {
  results.push({ width, check: label, passed })
  if (!passed) throw new Error(`${width}: ${label}`)
}
async function shot(page: Page, state: string, width: number): Promise<void> {
  await page.screenshot({ path: `functional-review/evidence/regression/${state}-${width}.png` })
  check(width, `${state}: no horizontal overflow`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
}

for (const width of [1280, 390]) {
  const page = await browser.newPage({ viewport: { width, height: 900 } })
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const data = structuredClone(fixture)
  data.review = { tiles: {} }
  let failure = false
  let loadError = false
  let loading = false
  await page.route('**/api/run*', async route => {
    if (loading) await new Promise(resolve => setTimeout(resolve, 1200))
    await route.fulfill({ status: loadError ? 503 : 200, json: loadError ? { error: 'Unavailable' } : data })
  })
  await page.route('**/api/review', async route => {
    const patch = route.request().postDataJSON()
    if (failure) { await route.fulfill({ status: 500, json: { error: 'Write failed' } }); return }
    const prior = data.review.tiles[patch.tileId] ?? { decision: null, note: '', updatedAt: '' }
    data.review.tiles[patch.tileId] = { ...prior, ...patch, updatedAt: new Date().toISOString() }
    await route.fulfill({ json: data.review.tiles[patch.tileId] })
  })
  await page.goto(base)
  await page.locator('.tile').first().waitFor()
  check(width, 'all fixture captures rendered', await page.locator('.tile').count() === 12)
  await page.locator('#search').fill('/cards')
  check(width, 'search routes', await page.locator('.tile').count() === 4)
  await page.locator('#viewport-filter').selectOption('390')
  await page.locator('#theme-filter').selectOption('dark')
  check(width, 'combined capture filters', await page.locator('.tile').count() === 1)
  await page.locator('#f-flagged').click()
  check(width, 'flagged filter keeps matching diagnostic', await page.locator('.tile').count() === 1)
  await page.locator('#search').fill('zzzz')
  await shot(page, 'no-results', width)
  await page.getByRole('button', { name: 'Clear filters', exact: true }).last().click()
  check(width, 'empty search recovers', await page.locator('.tile').count() === 12)
  const inspect = page.getByRole('button', { name: 'Inspect screenshot', exact: true }).first()
  await inspect.click()
  await page.locator('#viewer-image').evaluate((img: HTMLImageElement) => img.decode())
  await shot(page, 'viewer', width)
  await page.locator('#viewer-next').click()
  check(width, 'viewer next navigation', (await page.locator('#viewer-position').innerText()).includes('2 of 12'))
  await page.locator('#viewer-size').click()
  check(width, 'actual size toggles', await page.locator('#viewer-size').getAttribute('aria-pressed') === 'true')
  await page.keyboard.press('ArrowLeft')
  check(width, 'viewer keyboard navigation', (await page.locator('#viewer-position').innerText()).includes('1 of 12'))
  await page.keyboard.press('Escape')
  check(width, 'dialog closes and restores focus', await inspect.evaluate(node => node === document.activeElement))
  await page.locator('#next-pending').click()
  await page.keyboard.press('a')
  await page.getByText('All changes saved locally.', { exact: true }).waitFor()
  check(width, 'keyboard approval persisted', Object.values(data.review.tiles).some((entry: any) => entry.decision === 'approve'))
  await shot(page, 'saved', width)
  await page.locator('#status-filter').selectOption('approve')
  check(width, 'approved filter', await page.locator('.tile').count() === 1)
  await page.locator('#clear-filters').click()
  const card = page.locator('.tile').first()
  await card.getByRole('button', { name: 'Reject', exact: true }).click()
  await page.getByText('All changes saved locally.', { exact: true }).waitFor()
  await page.locator('#status-filter').selectOption('reject')
  check(width, 'rejected filter', await page.locator('.tile').count() >= 1)
  await page.locator('#clear-filters').click()
  failure = true
  const note = page.locator('.tile textarea').first()
  await note.fill('Keep this note through a failed save and route filtering.')
  await note.press('Tab')
  await page.getByRole('button', { name: 'Retry unsaved changes' }).waitFor()
  check(width, 'failed draft disables export', await page.locator('#export').isDisabled())
  await page.locator('#search').fill('/cards')
  await page.locator('#clear-filters').click()
  check(width, 'failed draft survives rerender', await page.locator('.tile textarea').first().inputValue() === 'Keep this note through a failed save and route filtering.')
  await shot(page, 'save-error', width)
  failure = false
  await page.getByRole('button', { name: 'Retry unsaved changes' }).click()
  await page.getByText('All changes saved locally.', { exact: true }).waitFor()
  check(width, 'retry saves retained draft', Object.values(data.review.tiles).some((entry: any) => entry.note.includes('Keep this note')))
  failure = true
  const retryNote = page.locator('.tile textarea').first()
  const savedNote = await retryNote.inputValue()
  await retryNote.fill('Failed draft to be reverted')
  await retryNote.press('Tab')
  await page.getByRole('button', { name: 'Retry unsaved changes' }).waitFor()
  await page.locator('.tile textarea').first().fill(savedNote)
  await page.locator('.tile textarea').first().press('Tab')
  failure = false
  await page.getByRole('button', { name: 'Retry unsaved changes' }).click()
  await page.getByText('All changes saved locally.', { exact: true }).waitFor()
  check(width, 'reverting a failed draft retries the latest intended note', !Object.values(data.review.tiles).some((entry: any) => entry.note === 'Failed draft to be reverted'))
  const downloadPromise = page.waitForEvent('download')
  await page.locator('#export').click()
  const download = await downloadPromise
  await download.saveAs(`functional-review/evidence/export-verified-${width}.json`)
  const exported = JSON.parse(await (await import('node:fs/promises')).readFile(`functional-review/evidence/export-verified-${width}.json`, 'utf8'))
  check(width, 'export contains full evidence and confirmed notes', exported.run.tiles.length === 12 && Object.values(exported.review.tiles).some((entry: any) => entry.note.includes('Keep this note')))
  await page.reload()
  await page.locator('.tile').first().waitFor()
  check(width, 'reload reads persisted reviews', await page.locator('.tile textarea').first().inputValue() === 'Keep this note through a failed save and route filtering.')
  await page.locator('#search').fill('/cards')
  await page.locator('#route-nav a').filter({ hasText: '/about' }).click()
  check(width, 'route index recovers filtered-out anchors', await page.locator('.tile').count() === 12)
  for (const tile of data.run.tiles) data.review.tiles[tile.id] = { decision: 'approve', note: '', updatedAt: new Date().toISOString() }
  await page.reload(); await page.locator('.tile').first().waitFor()
  check(width, 'review completion explicit', (await page.locator('#progress-label').innerText()).includes('Review complete'))
  await shot(page, 'complete', width)
  data.run.tiles[0].warnings = ['Page did not become network-idle; screenshot captured after timeout.']
  data.run.tiles[0].textClipped = [{ selector: '.heading', text: 'Clipped example' }]
  data.critique = { tiles: {
    [data.run.tiles[0].id]: { verdict: 'fix', issues: [{ severity: 'major', what: 'Heading clipped', where: 'Hero' }] },
    [data.run.tiles[1].id]: { verdict: 'error', error: 'Critique service unavailable' },
    [data.run.tiles[2].id]: { verdict: 'pass', issues: [] },
  } }
  await page.reload(); await page.locator('.tile').first().waitFor()
  check(width, 'warning cards do not claim checks clear', await page.locator('.tile').first().getByText('Checks clear', { exact: true }).count() === 0)
  check(width, 'all critique states visible', await page.getByText('Critique: needs work', { exact: true }).count() === 1 && await page.getByText('Critique unavailable', { exact: true }).count() === 1 && await page.getByText('Critique: pass', { exact: true }).count() === 1)
  await page.locator('.diagnostics summary').first().click()
  await page.locator('.tile').first().scrollIntoViewIfNeeded()
  await shot(page, 'diagnostics', width)
  await page.route('**/img/**', route => route.fulfill({ status: 404, body: 'Not found' }))
  await page.reload(); await page.getByText('Screenshot unavailable. Check this run’s capture files.').first().waitFor()
  check(width, 'missing screenshot disables inspection', await page.getByRole('button', { name: 'Inspect screenshot', exact: true }).first().isDisabled())
  await page.locator('.tile').first().scrollIntoViewIfNeeded()
  await shot(page, 'missing-image', width)
  await page.unroute('**/img/**')
  data.run.tiles = []
  await page.reload(); await page.getByRole('heading', { name: 'No captures in this run.' }).waitFor()
  await shot(page, 'empty', width)
  loadError = true
  await page.reload(); await page.getByRole('heading', { name: 'Could not load this run.' }).waitFor()
  await shot(page, 'load-error', width)
  loadError = false; data.run = structuredClone(fixture.run)
  await page.getByRole('button', { name: 'Retry loading' }).click()
  await page.locator('.tile').first().waitFor()
  check(width, 'load error retry recovers', await page.locator('.tile').count() === 12)
  loading = true
  await page.reload({ waitUntil: 'domcontentloaded' })
  await shot(page, 'loading', width)
  await page.locator('.tile').first().waitFor()
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' })
  await page.locator('.thumb img').evaluateAll(images => images.forEach(image => (image as HTMLImageElement).loading = 'eager'))
  await page.waitForFunction(() => [...document.querySelectorAll('.thumb img')].every(image => (image as HTMLImageElement).complete))
  await shot(page, 'dark-review', width)
  check(width, 'no uncaught browser errors', errors.length === 0)
  await page.close()
}
writeFileSync('functional-review/evidence/browser-checks.json', JSON.stringify(results, null, 2))
console.log(`${results.length} browser checks passed`)
await browser.close()
