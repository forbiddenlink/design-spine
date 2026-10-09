import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { chromium, firefox, webkit } from 'playwright'
import { PNG } from 'pngjs'
import { startReviewServer } from '../../src/lib/server.ts'
import { writeJson } from '../../src/lib/runs.ts'
import type { RunRecord, Tile } from '../../src/lib/types.ts'

const engine = process.argv[2] || 'chromium'
if (!['chromium', 'firefox', 'webkit'].includes(engine)) throw new Error('Unknown engine')
const out = 'design-research/reliability/' + engine
mkdirSync(join(out, '.design-spine/runs'), { recursive: true })
const statuses = ['changed', 'unchanged', 'new', 'size-changed', 'unavailable', 'no-capture']
const checks: { width: number; theme: string; name: string; passed: boolean }[] = []
const audits: unknown[] = []
const browser = await ({ chromium, firefox, webkit }[engine as 'chromium' | 'firefox' | 'webkit']).launch()
writeFileSync(join(out, 'environment.json'), JSON.stringify({ engine, version: browser.version(), runtime: Bun.version, platform: process.platform, scope: 'Installed desktop browser engine with viewport emulation; not a physical device or Safari application test.' }, null, 2) + '\n')
function image(changed = false, height = 800): Buffer {
  const png = new PNG({ width: 390, height })
  for (let y = 0; y < height; y++) for (let x = 0; x < png.width; x++) {
    const i = (y * png.width + x) * 4
    const ink = y < 70 || (y % 100 < 25 && x > 24 && x < 350)
    png.data[i] = changed && y < 100 ? 180 : ink ? 32 : 247
    png.data[i + 1] = ink ? 35 : 246; png.data[i + 2] = ink ? 31 : 242; png.data[i + 3] = 255
  }
  return PNG.sync.write(png)
}
const current = image(); const changed = image(true); const shorter = image(false, 700)
try {
 for (const width of [1280, 390]) for (const theme of ['light', 'dark'] as const) {
  const check = (name: string, passed: boolean): void => { checks.push({ width, theme, name, passed }); if (!passed) throw new Error(name) }
  const root = mkdtempSync(join(out, '.design-spine/runs/session-'))
  const dir = join(root, '.design-spine/runs/review'); const baselines = join(root, '.design-spine/baselines')
  mkdirSync(dir, { recursive: true }); mkdirSync(baselines, { recursive: true })
  const tiles: Tile[] = statuses.flatMap((status, group) => Array.from({ length: 10 }, (_, index) => {
    const id = status + '-' + index; const file = id + '.png'
    const tile: Tile = { id, file, route: '/' + status, path: '/' + status, state: String(index).padStart(2, '0'), viewport: index % 2 ? 1280 : 390, theme: index % 2 ? 'dark' : 'light', status: 200, consoleErrors: [], pageErrors: [], overflowX: false, blankRegions: { count: 0, boxes: [] }, brokenImages: [], textClipped: [], ...(status === 'no-capture' ? { error: 'Generated capture failure' } : {}) }
    if (status !== 'no-capture') writeFileSync(join(dir, file), status === 'changed' ? changed : current)
    if (!['new', 'no-capture'].includes(status)) writeFileSync(join(baselines, file), status === 'size-changed' ? shorter : status === 'unavailable' ? Buffer.from('Generated invalid PNG') : current)
    return tile
  }))
  const run: RunRecord = { id: 'workflow-generated-' + width + '-' + theme, startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(), baseUrl: 'http://generated.local', tiles }
  writeJson(join(dir, 'run.json'), run)
  const server = startReviewServer(dir, 0); const base = 'http://localhost:' + server.port
  const page = await browser.newPage({ viewport: { width, height: 900 }, colorScheme: theme })
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message))
  try {
   let failComparison = true
   await page.route('**/api/comparison', async route => { if (failComparison) { await new Promise(r => setTimeout(r, 200)); return route.fulfill({ status: 503 }) } await route.continue() })
   await page.goto(base); await page.locator('.tile').first().waitFor()
   check('comparison filter disabled while loading', await page.locator('#comparison-filter').isDisabled())
   await page.getByRole('button', { name: 'Retry comparison', exact: true }).waitFor()
   check('comparison filter disabled on comparison failure', await page.locator('#comparison-filter').isDisabled())
   failComparison = false; await page.getByRole('button', { name: 'Retry comparison', exact: true }).click()
   await page.waitForFunction(() => document.querySelector('#comparison-status')?.textContent?.startsWith('Comparison ready'))
   const snapshot = await (await fetch(base + '/api/comparison')).json()
   check('all six real comparison states', statuses.every(status => snapshot.tiles[status + '-0'].status === status))
   for (const status of statuses) {
    await page.locator('#comparison-filter').selectOption(status)
    const ids = await page.locator('.tile').evaluateAll(elements => elements.map(element => (element as HTMLElement).dataset.id))
    check('exact filter ' + status, ids.length === 10 && ids.every(id => id?.startsWith(status + '-')))
   }
   await page.locator('#comparison-filter').selectOption('changed'); await page.locator('#viewport-filter').selectOption('390')
   await page.locator('#theme-filter').selectOption('light'); await page.getByRole('searchbox').fill('/changed')
   check('comparison combines with viewport/theme/search', await page.locator('.tile').count() === 5)
   await page.locator('#f-changed').click()
   check('broad change shortcut resets exact filter', await page.locator('#comparison-filter').inputValue() === '' && await page.locator('#f-changed').getAttribute('aria-pressed') === 'true')
   await page.getByRole('searchbox').fill('')
   await page.locator('#comparison-filter').selectOption('unchanged')
   check('exact selection resets broad change shortcut', await page.locator('#f-changed').getAttribute('aria-pressed') === 'false' && await page.locator('.tile').count() === 5)
   await page.getByRole('button', { name: 'Clear filters', exact: true }).click()
   check('clear restores 48-card page', await page.locator('.tile').count() === 48 && await page.locator('#comparison-filter').inputValue() === '')
   await page.screenshot({ path: `${out}/after-review-${theme}-${width}.png` })
   await page.locator('.tile[data-id="changed-0"] .inspect').click()
   await page.locator('.viewer-note summary').click()
   await page.locator('#viewer-note').fill('First draft; synthetic test only.')
   await page.locator('#viewer-note').press('ArrowRight')
   check('arrow in note does not navigate', (await page.locator('#viewer-position').innerText()).includes('1 of 50'))
   await page.locator('#viewer-next').click(); await page.locator('#viewer-prev').click()
   check('draft survives viewer navigation', await page.locator('#viewer-note').inputValue() === 'First draft; synthetic test only.' && await page.locator('#export').isDisabled())
   await page.locator('#viewer-close').click()
   await page.waitForFunction(() => (document.querySelector('.tile[data-id="changed-0"] textarea') as HTMLTextAreaElement)?.value === 'First draft; synthetic test only.')
   check('draft synchronized with card after close', await page.locator('.tile[data-id="changed-0"] textarea').inputValue() === 'First draft; synthetic test only.')
   await page.locator('.tile[data-id="changed-0"] .inspect').click()
   await page.locator('#viewer-approve').click()
   await page.waitForFunction(() => document.querySelector('#viewer-decision')?.textContent === 'Approved')
   const saved = (): any => JSON.parse(readFileSync(join(dir, 'review.json'), 'utf8')).tiles
   check('viewer approval includes exact draft on disk', saved()['changed-0'].decision === 'approve' && saved()['changed-0'].note === 'First draft; synthetic test only.')
   check('confirmed decision remains in viewer', (await page.locator('#viewer-position').innerText()).includes('1 of 50') && await page.locator('#viewer-approve').getAttribute('aria-pressed') === 'true')
   await page.locator('#viewer-approve').click(); await page.waitForFunction(() => document.querySelector('#viewer-decision')?.textContent === 'Pending')
   check('viewer decision toggles back to pending', saved()['changed-0'].decision === null)
   let failSave = true; let release: (() => void) | undefined; let delaySave = false
   await page.route('**/api/review', async route => { if (failSave) return route.fulfill({ status: 503 }); if (delaySave) await new Promise<void>(resolve => { release = resolve }); await route.continue() })
   await page.locator('#viewer-note').fill('Failed draft stays visible.')
   await page.locator('#viewer-reject').click(); await page.locator('#viewer-save-status.error').waitFor()
   check('failed decision keeps confirmed state and draft', await page.locator('#viewer-decision').innerText() === 'Pending' && await page.locator('#viewer-note').inputValue() === 'Failed draft stays visible.' && saved()['changed-0'].decision === null)
   await page.screenshot({ path: `${out}/failed-save-${theme}-${width}.png` })
   failSave = false; await page.locator('#viewer-retry').click(); await page.waitForFunction(() => document.querySelector('#viewer-decision')?.textContent === 'Rejected')
   check('retry persists decision and draft', saved()['changed-0'].decision === 'reject' && saved()['changed-0'].note === 'Failed draft stays visible.')
   delaySave = true
   await page.locator('#viewer-note').fill('Older note in flight.')
   await page.locator('#viewer-save-note').click(); await page.waitForFunction(() => (document.querySelector('#viewer-save-note') as HTMLButtonElement).disabled)
   await page.locator('#viewer-note').fill('Newer note must survive.')
   while (!release) await new Promise(r => setTimeout(r, 5))
   delaySave = false; release()
   await page.waitForFunction(() => document.querySelector('#viewer-save-status')?.textContent?.startsWith('Unsaved'))
   check('newer draft survives older response', saved()['changed-0'].note === 'Older note in flight.' && await page.locator('#viewer-note').inputValue() === 'Newer note must survive.' && !await page.locator('#viewer-save-note').isDisabled())
   await page.locator('#viewer-save-note').click(); await page.waitForFunction(() => document.querySelector('#viewer-save-status')?.textContent?.startsWith('All changes saved'))
   check('explicit note save preserves decision', saved()['changed-0'].note === 'Newer note must survive.' && saved()['changed-0'].decision === 'reject')
   await page.locator('#viewer-note').fill('x'.repeat(2000)); await page.locator('#viewer-save-note').click(); await page.waitForFunction(() => document.querySelector('#viewer-save-status')?.textContent?.startsWith('All changes saved'))
   check('viewer accepts and persists full note limit', await page.locator('#viewer-note').getAttribute('maxlength') === '2000' && saved()['changed-0'].note === 'x'.repeat(2000))
   await page.locator('#viewer-note').fill('Newer note must survive.'); await page.locator('#viewer-save-note').click(); await page.waitForFunction(() => document.querySelector('#viewer-save-status')?.textContent?.startsWith('All changes saved'))
   release = undefined; delaySave = true
   await page.locator('#viewer-note').fill('Transient note A.'); await page.locator('#viewer-save-note').click()
   await page.waitForFunction(() => (document.querySelector('#viewer-approve') as HTMLButtonElement).disabled)
   await page.locator('#viewer-note').fill('Newer note must survive.')
   while (!release) await new Promise(r => setTimeout(r, 5))
   delaySave = false; release()
   await page.waitForFunction(() => !(document.querySelector('#viewer-approve') as HTMLButtonElement).disabled)
   check('reverting to pre-request note remains a newer draft', saved()['changed-0'].note === 'Transient note A.' && !await page.locator('#viewer-save-note').isDisabled())
   await page.locator('#viewer-next').click(); await page.locator('#viewer-prev').click()
   check('reverted draft survives navigation after old response', await page.locator('#viewer-note').inputValue() === 'Newer note must survive.')
   await page.locator('#viewer-save-note').click(); await page.waitForFunction(() => document.querySelector('#viewer-save-status')?.textContent?.startsWith('All changes saved'))
   check('open-note viewer preserves usable image space', await page.locator('.viewer-canvas').evaluate(element => element.clientHeight >= 250))
   await page.screenshot({ path: `${out}/after-viewer-${theme}-${width}.png` })
   await page.addScriptTag({ path: 'design-research/.tool-cache/_npx/1722e863ebfd623b/node_modules/axe-core/axe.min.js' })
   async function audit(view: string): Promise<void> {
    const result = await page.evaluate(async () => (window as any).axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } }))
    audits.push({ width, theme, view, violations: result.violations, incomplete: result.incomplete })
    check(view + ' no axe violations', result.violations.length === 0)
   }
   await audit('viewer-open-note')
   await page.locator('#viewer-pending').click()
   check('next pending skips reviewed screenshot', (await page.locator('#viewer-position').innerText()).includes('2 of 50') && await page.locator('#viewer-decision').innerText() === 'Pending')
   await page.locator('#viewer-close').click(); await audit('review')
   await page.locator('#comparison-filter').selectOption('changed'); await page.locator('#f-unrev').click()
   await page.locator('.tile[data-id="changed-3"] .inspect').click()
   failSave = true; await page.locator('#viewer-approve').click(); await page.locator('#viewer-save-status.error').waitFor()
   check('filtered failed decision retains middle screenshot', (await page.locator('#viewer-title').innerText()).includes('03') && (await page.locator('#viewer-position').innerText()).includes('3 of 9'))
   failSave = false; await page.locator('#viewer-retry').click()
   await page.waitForFunction(() => document.querySelector('#viewer-save-status')?.textContent?.startsWith('All changes saved'))
   check('retry leaving filtered set advances to next neighbor', (await page.locator('#viewer-title').innerText()).includes('04') && (await page.locator('#viewer-position').innerText()).includes('3 of 8') && saved()['changed-3'].decision === 'approve')
   await page.locator('#viewer-close').click()
   await page.locator('.tile[data-id="changed-1"] .inspect').click(); await page.locator('#viewer-approve').click()
   await page.waitForFunction(() => document.querySelector('#viewer-note') && document.querySelector('#viewer-position')?.textContent?.includes('1 of 7'))
   check('decision leaving filtered set advances to neighbor', (await page.locator('#viewer-position').innerText()).includes('1 of 7') && await page.locator('#viewer-decision').innerText() === 'Pending')
   await page.locator('#viewer-close').click()
   await page.getByRole('searchbox').fill('/changed 02')
   check('one filtered screenshot remains', await page.locator('.tile').count() === 1)
   await page.locator('.inspect').click(); await page.locator('#viewer-approve').click()
   await page.waitForFunction(() => !(document.querySelector('#lightbox') as HTMLDialogElement).open)
   check('last filtered decision closes with useful focus', await page.locator('#cards').innerText().then(text => text.includes('No captures match.')) && await page.locator('#clear-filters').evaluate(element => element === document.activeElement))
   await page.getByRole('button', { name: 'Clear filters', exact: true }).first().click()
   await page.locator('#comparison-filter').selectOption('new'); await page.locator('#f-unrev').click()
   await page.locator('.tile[data-id="new-1"] .inspect').click()
   failSave = true; await page.locator('#viewer-approve').click(); await page.locator('#viewer-save-status.error').waitFor()
   await page.locator('#viewer-next').click(); await page.locator('#viewer-next').click(); await page.locator('#viewer-approve').click()
   await page.waitForFunction(() => !(document.querySelector('#viewer-approve') as HTMLButtonElement).disabled)
   failSave = false; await page.locator('#viewer-retry').click()
   await page.waitForFunction(() => document.querySelector('#viewer-save-status')?.textContent?.startsWith('All changes saved'))
   check('multiple filtered retries preserve next neighbor by identity', (await page.locator('#viewer-title').innerText()).includes('04') && (await page.locator('#viewer-position').innerText()).includes('3 of 8') && saved()['new-1'].decision === 'approve' && saved()['new-3'].decision === 'approve')
   await page.locator('#viewer-close').click(); await page.getByRole('button', { name: 'Clear filters', exact: true }).first().click()
   await page.locator('.tile').nth(47).locator('.inspect').click(); await page.locator('#viewer-next').click()
   check('viewer crosses rendered page boundary', (await page.locator('#viewer-position').innerText()).includes('49 of 50'))
   await page.locator('#viewer-close').click()
   await page.waitForFunction(() => document.querySelector('#page-label')?.textContent?.includes('Page 2 of 2'))
   check('close focuses viewed screenshot on correct page', (await page.locator('#page-label').innerText()).includes('Page 2 of 2') && await page.locator('.tile[data-id="unavailable-8"]').evaluate(element => element === document.activeElement))
   await page.reload(); await page.locator('.tile').first().waitFor(); await page.waitForFunction(() => !(document.querySelector('#export') as HTMLButtonElement).disabled)
   check('reload confirms viewer notes/decisions', await page.locator('.tile[data-id="changed-0"] textarea').inputValue() === 'Newer note must survive.' && await page.locator('.tile[data-id="changed-0"] .actions button.reject').getAttribute('aria-pressed') === 'true')
   const download = page.waitForEvent('download'); await page.locator('#export').click(); const file = await download
   const exported = await Bun.file((await file.path())!).json()
   check('export includes all 60 captures and viewer decisions', exported.run.tiles.length === 60 && exported.review.tiles['changed-0'].note === 'Newer note must survive.' && exported.review.tiles['changed-0'].decision === 'reject')
   check('no uncaught errors or horizontal document overflow', errors.length === 0 && await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  } finally { await page.close(); server.stop(true) }
 }
} finally {
 await browser.close()
 writeFileSync(join(out, 'checks.json'), JSON.stringify(checks, null, 2) + '\n')
 writeFileSync(join(out, 'accessibility.json'), JSON.stringify(audits, null, 2) + '\n')
}
console.log(checks.length + ' browser assertions passed')
