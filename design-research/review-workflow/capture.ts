import { chromium } from 'playwright'
const browser = await chromium.launch()
try {
 for (const width of [1280, 390]) for (const theme of ['light', 'dark'] as const) {
  const page = await browser.newPage({ viewport: { width, height: 900 }, colorScheme: theme })
  await page.goto('http://localhost:14870'); await page.locator('.tile').first().waitFor()
  await page.waitForFunction(() => document.querySelector('#comparison-status')?.textContent?.startsWith('Comparison ready'))
  await page.locator('.thumb img').evaluateAll(images => images.forEach(image => (image as HTMLImageElement).loading = 'eager'))
  await page.waitForFunction(() => [...document.querySelectorAll('.thumb img')].every(image => (image as HTMLImageElement).complete))
  await page.screenshot({ path: `design-research/review-workflow/real-review-${theme}-${width}.png` })
  await page.locator('.inspect').first().click(); await page.locator('.viewer-note summary').click()
  await page.locator('#viewer-image').evaluate((image: HTMLImageElement) => image.decode())
  await page.screenshot({ path: `design-research/review-workflow/real-viewer-${theme}-${width}.png` })
  await page.close()
 }
} finally { await browser.close() }
