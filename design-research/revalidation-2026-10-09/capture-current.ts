import { chromium } from 'playwright'
const browser = await chromium.launch()
try {
  for (const width of [1280, 390]) for (const theme of ['light', 'dark'] as const) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, colorScheme: theme })
    await page.goto('http://localhost:14860')
    await page.locator('.tile').first().waitFor()
    await page.waitForFunction(() => document.querySelector('#comparison-status')?.textContent?.startsWith('Comparison ready'))
    await page.locator('.thumb img').evaluateAll(images => images.forEach(image => (image as HTMLImageElement).loading = 'eager'))
    await page.waitForFunction(() => [...document.querySelectorAll('.thumb img')].every(image => (image as HTMLImageElement).complete))
    await page.evaluate(() => scrollTo(0, 0))
    await page.screenshot({ path: `design-research/revalidation-2026-10-09/review-${theme}-${width}.png`, fullPage: true })
    await page.close()
  }
} finally { await browser.close() }
