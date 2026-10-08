import { mkdirSync, mkdtempSync, copyFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { startReviewServer } from '../src/lib/server.ts'
import { writeJson } from '../src/lib/runs.ts'

mkdirSync('functional-review/evidence/.design-spine/runs', { recursive: true })
const root = mkdtempSync(join(process.cwd(), 'functional-review/evidence/.design-spine/runs/large-'))
const dir = join(root, 'runs/review'); mkdirSync(dir, { recursive: true }); mkdirSync(join(root, 'baselines'))
const source = Bun.serve({ port: 0, fetch() { return new Response('<html><head><title>Owned large evidence fixture</title><style>body{margin:0;height:6144px;background:#f8f7f1;font:32px system-ui}.region{position:absolute;top:5200px;left:120px;width:800px;height:280px;background:#ddd}</style></head><body><h1>Generated long capture</h1><div class="region"></div></body></html>', { headers: { 'content-type': 'text/html' } }) } })
const browser = await chromium.launch(); let review: ReturnType<typeof startReviewServer> | undefined
const checks: unknown[] = []
function check(name: string, passed: boolean): void { checks.push({ name, passed }); if (!passed) throw new Error(name) }
try {
  const capture = await browser.newPage({ viewport: { width: 2048, height: 900 } }); await capture.goto(`http://localhost:${source.port}`)
  const box = await capture.locator('.region').evaluate(el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height } })
  await capture.screenshot({ path: join(dir, 'large.png'), fullPage: true }); await capture.close(); copyFileSync(join(dir, 'large.png'), join(root, 'baselines/large.png'))
  writeJson(join(dir, 'run.json'), { id: 'large-evidence', startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(), baseUrl: `http://localhost:${source.port}`, tiles: [{ id: 'large', file: 'large.png', route: '/', path: '/', state: 'ideal', viewport: 2048, theme: 'light', status: 200, consoleErrors: [], pageErrors: [], overflowX: false, blankRegions: { count: 1, boxes: [box] }, brokenImages: [], textClipped: [] }] })
  review = startReviewServer(dir, 0)
  for (const width of [1280, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } }); await page.goto(`http://localhost:${review.port}`)
    await page.waitForFunction(() => document.querySelector('#comparison-status')?.textContent?.startsWith('Comparison ready'))
    await page.getByRole('button', { name: 'Inspect screenshot', exact: true }).click()
    await page.waitForFunction(() => document.querySelector<HTMLImageElement>('#viewer-image')?.naturalWidth === 2048)
    check(`${width}: full native evidence dimensions`, await page.locator('#viewer-image').evaluate((img: HTMLImageElement) => img.naturalHeight === 6144))
    await page.locator('#viewer-region').selectOption('0')
    check(`${width}: jump brings distant diagnostic into view`, await page.locator('#diagnostic-overlay rect').evaluate(rect => { const r = rect.getBoundingClientRect(); const canvas = document.querySelector('.viewer-canvas')!.getBoundingClientRect(); return r.top >= canvas.top && r.bottom <= canvas.bottom }))
    await page.screenshot({ path: `functional-review/evidence/large-jump-${width}.png` })
    await page.getByRole('button', { name: 'Actual size', exact: true }).click()
    check(`${width}: actual-size evidence scrolls horizontally`, await page.locator('.viewer-canvas').evaluate(el => el.scrollWidth > el.clientWidth))
    await page.getByRole('button', { name: 'Fit to width', exact: true }).click()
    await page.locator('#viewer-mode').selectOption('split')
    await page.waitForFunction(() => document.querySelector<HTMLImageElement>('#baseline-image')?.naturalHeight === 6144)
    check(`${width}: large baseline loads without resizing native evidence`, await page.locator('#viewer-image').evaluate((img: HTMLImageElement) => img.naturalWidth === 2048))
    await page.close()
  }
} finally { await browser.close(); review?.stop(); source.stop(); writeJson('functional-review/evidence/large-checks.json', checks) }
console.log(`${checks.length} large-evidence checks passed`)
