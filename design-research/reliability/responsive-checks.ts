import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { startReviewServer } from '../../src/lib/server.ts'
import { writeJson } from '../../src/lib/runs.ts'
const fixture = JSON.parse(readFileSync('design-research/reliability/packaging-final-confirmed.json','utf8')).root + '/.design-spine/runs/demo'
const out = 'design-research/reliability/responsive'; mkdirSync(out, { recursive: true })
const server = startReviewServer(fixture, 0); const browser = await chromium.launch()
const checks: { name: string, passed: boolean }[] = []
function check(name: string, passed: boolean): void { checks.push({ name, passed }); if (!passed) throw new Error(name) }
try {
 for (const [width, height] of [[320,780],[375,812],[768,1024],[1024,768],[1440,900],[1920,1080],[844,390]]) {
  const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce', forcedColors: width === 375 ? 'active' : 'none' })
  await page.goto('http://localhost:' + server.port); await page.locator('.tile').first().waitFor()
  await page.locator('#comparison-status').filter({hasText: 'Comparison ready'}).waitFor().catch(() => {})
  check(`${width}x${height} sheet has no horizontal overflow`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  await page.screenshot({path: join(out, `sheet-${width}x${height}.png`)})
  await page.locator('.inspect').first().click(); await page.locator('.viewer-note summary').click()
  check(`${width}x${height} dialog has no horizontal overflow`, await page.locator('#lightbox').evaluate(e => e.scrollWidth <= e.clientWidth + 1))
  check(`${width}x${height} note is usable`, await page.locator('#viewer-note').isVisible())
  await page.locator('.inspect').first().evaluate(e => (e as HTMLElement).focus()); check(`${width}x${height} background controls stay inert`, await page.locator('#lightbox').evaluate(e => e.contains(document.activeElement)));
  for (let n = 0; n < 20; n++) { await page.keyboard.press('Tab'); const focus = await page.evaluate(() => ({ tag: document.activeElement?.tagName, id: document.activeElement?.id, hasFocus: document.hasFocus(), inModal: document.querySelector('#lightbox')?.contains(document.activeElement) })); check(`${width}x${height} tab avoids background controls ${n}`, focus.inModal === true || (focus.tag === 'BODY' && !focus.hasFocus)) }
  await page.locator('#viewer-save-note').scrollIntoViewIfNeeded();
  const button = await page.locator('#viewer-save-note').boundingBox(); check(`${width}x${height} note save can be reached`, !!button && button.y >= 0 && button.y + button.height <= height);
  await page.screenshot({path: join(out, `viewer-${width}x${height}.png`)})
  await page.keyboard.press('Escape'); await page.locator('#lightbox').waitFor({ state: 'hidden' }); await page.waitForFunction(() => document.querySelector('.inspect') === document.activeElement); const restored = await page.evaluate(() => ({ focus: document.activeElement?.outerHTML.slice(0, 200), inspect: document.querySelector('.inspect')?.outerHTML.slice(0, 200), equal: document.querySelector('.inspect') === document.activeElement })); console.log(width, restored); check(`${width}x${height} escape restores inspect focus`, restored.equal)
  await page.close()
 }
} finally { await browser.close(); server.stop(true); writeJson(join(out,'checks.json'),checks) }
console.log(checks.length + ' responsive and keyboard checks passed')
