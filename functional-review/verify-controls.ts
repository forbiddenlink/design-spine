import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { PNG } from 'pngjs'
import { writeJson } from '../src/lib/runs.ts'

const browser = await chromium.launch(); const checks: unknown[] = []
function check(name: string, passed: boolean): void { checks.push({ name, passed }); if (!passed) throw new Error(name) }
try {
  for (const width of [1280, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const fixture = await (await fetch('http://localhost:14850/api/run?compare=false')).json(); fixture.run.tiles[0].consoleErrors = ['Generated diagnostic detail'];
    await page.route('**/api/run*', route => route.fulfill({ json: fixture }));
    if (process.argv.includes('--before')) await page.route('http://localhost:14850/', route => route.fulfill({ contentType: 'text/html', body: spawnSync('git', ['show', 'HEAD:src/ui/index.html'], { encoding: 'utf8' }).stdout }));
    await page.goto('http://localhost:14850')
    await page.locator('.tile').first().waitFor(); await page.keyboard.press('Tab'); await page.keyboard.press('Enter')
    check(`${width}: skip link focuses review`, await page.locator('#main').evaluate(el => el === document.activeElement))
    const details = page.locator('details').first(); await details.locator('summary').click()
    check(`${width}: diagnostic disclosure opens`, await details.evaluate((el: HTMLDetailsElement) => el.open))
    await details.locator('summary').press('Enter'); check(`${width}: diagnostic disclosure closes by keyboard`, !await details.evaluate((el: HTMLDetailsElement) => el.open))
    check(`${width}: Enter on a disclosure keeps the viewer closed`, !await page.locator('#lightbox').evaluate((el: HTMLDialogElement) => el.open))
    await page.getByRole('button', { name: 'Inspect screenshot', exact: true }).first().click()
    await page.waitForFunction(() => document.querySelector<HTMLImageElement>('#viewer-image')?.naturalWidth)
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Download', exact: true }).click()])
    const file = `functional-review/evidence/download-${width}.png`; await download.saveAs(file)
    const downloaded = readFileSync(file); const expected = Buffer.from(await (await fetch(download.url())).arrayBuffer())
    check(`${width}: native PNG download matches served evidence`, downloaded.equals(expected) && PNG.sync.read(downloaded).width > 0)
    await page.mouse.click(0, 0)
    check(`${width}: backdrop closes dialog`, !await page.locator('#lightbox').evaluate((el: HTMLDialogElement) => el.open))
    if (!process.argv.includes('--before')) {
      await page.locator('.thumb img').evaluateAll(images => images.forEach(img => (img as HTMLImageElement).loading = 'eager'))
      await page.waitForFunction(() => [...document.querySelectorAll<HTMLImageElement>('.thumb img')].every(img => img.complete && img.naturalWidth))
      for (const theme of ['light', 'dark'] as const) { await page.emulateMedia({ colorScheme: theme }); await page.screenshot({ path: `functional-review/evidence/review-final-${theme}-${width}.png`, fullPage: true }) }
    }
    await page.close()
  }
} finally { await browser.close(); writeJson('functional-review/evidence/controls' + (process.argv.includes('--before') ? '-before' : '') + '-checks.json', checks) }
console.log(`${checks.length} control checks passed`)
