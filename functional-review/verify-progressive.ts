import { chromium } from 'playwright'
import { readFileSync, writeFileSync } from 'node:fs'
import { startReviewServer } from '../src/lib/server.ts'
import { writeJson } from '../src/lib/runs.ts'
const source = JSON.parse(readFileSync('design-research/.design-spine/runs/2026-10-08T15-32-24-858Z/run.json', 'utf8'))
const dir = 'design-research/.design-spine/runs/comparison-scale-sandbox/runs/measurement'
const tiles = Array.from({ length: 100 }, (_, index) => ({ ...source.tiles[0], id: 'measure-' + index, file: 'measure-' + index + '.png' }))
writeJson(dir + '/run.json', { ...source, tiles }); writeJson(dir + '/review.json', { tiles: {} })
const server = startReviewServer(dir, 0); const base = 'http://localhost:' + server.port
const browser = await chromium.launch(); const checks = []; const timings: Record<string, number> = {}
function check(name: string, passed: boolean): void { checks.push({ check: name, passed }); if (!passed) throw new Error(name) }
try {
 const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
 const start = performance.now(); await page.goto(base); await page.locator('.tile').first().waitFor(); timings.capturesVisibleMilliseconds = performance.now() - start
 check('captures render before comparison completes', (await page.locator('#comparison-status').innerText()).startsWith('Comparing captures'))
 check('changed filter and export wait for evidence', await page.getByRole('button', { name: 'Only changed', exact: true }).isDisabled() && await page.getByRole('button', { name: 'Export review' }).isDisabled())
 const note = page.getByRole('textbox', { name: 'Review note for measure-0', exact: true }); await note.fill('Editing while comparison runs')
 const saveStart = performance.now(); const saved = await fetch(base + '/api/review', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tileId: 'measure-99', decision: 'approve' }) }); timings.concurrentSaveMilliseconds = performance.now() - saveStart
 check('save API responds while comparisons are running', saved.ok && timings.concurrentSaveMilliseconds < 500)
 await page.screenshot({ path: 'functional-review/evidence/regression/comparison-progressive-pending.png' })
 await page.waitForFunction(() => document.querySelector('#comparison-status')?.textContent?.startsWith('Comparison ready'))
 timings.comparisonReadyMilliseconds = performance.now() - start
 check('comparison completion preserves active draft and focus', await note.inputValue() === 'Editing while comparison runs' && await note.evaluate(element => document.activeElement === element))
 await page.screenshot({ path: 'functional-review/evidence/regression/comparison-progressive-ready.png' })
 await page.close()
 for (const width of [1280, 390]) {
  const failurePage = await browser.newPage({ viewport: { width, height: 900 } }); let fail = true
  await failurePage.route('**/api/comparison', route => fail ? route.fulfill({ status: 503, json: { error: 'Generated failure' } }) : route.continue())
  await failurePage.goto(base); await failurePage.getByRole('button', { name: 'Retry comparison', exact: true }).waitFor()
  check(width + ': comparison error leaves captures usable', await failurePage.locator('.tile').count() === 48 && !await failurePage.locator('.tile').first().getByRole('button', { name: 'Approve', exact: true }).isDisabled())
  await failurePage.screenshot({ path: `functional-review/evidence/regression/comparison-progressive-error-${width}.png` })
  fail = false; await failurePage.getByRole('button', { name: 'Retry comparison', exact: true }).click()
  const retryNote = failurePage.getByRole('textbox', { name: 'Review note for measure-0', exact: true }); await retryNote.fill('New draft during retry')
  check(width + ': retry shows pending evidence with usable captures', (await failurePage.locator('#comparison-status').innerText()).startsWith('Comparing captures') && await failurePage.locator('.tile').count() === 48)
  await failurePage.screenshot({ path: `functional-review/evidence/regression/comparison-progressive-pending-${width}.png` })
  await failurePage.waitForFunction(() => document.querySelector('#comparison-status')?.textContent?.startsWith('Comparison ready'))
  check(width + ': retry completion preserves new draft focus', await retryNote.inputValue() === 'New draft during retry' && await retryNote.evaluate(element => document.activeElement === element))
  check(width + ': comparison retry recovers', !await failurePage.getByRole('button', { name: 'Only changed', exact: true }).isDisabled())
  await failurePage.close()
 }
 writeFileSync('functional-review/evidence/progressive-checks.json', JSON.stringify({ checks, timings, scope: '100 unique file pairs copied from own generated capture; isolated review storage' }, null, 2)); console.log({ checks: checks.length, timings })
} finally { await browser.close(); server.stop() }
