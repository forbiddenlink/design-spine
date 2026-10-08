import { chromium } from 'playwright'

const browser = await chromium.launch()
const round = process.argv[2] ?? 'round2'
for (const width of [1280, 390]) {
  const page = await browser.newPage({ viewport: { width, height: 900 } })
  await page.goto('http://localhost:14747')
  await page.locator('.tile').first().waitFor()
  await page.locator('.thumb img').evaluateAll(images => images.forEach(image => (image as HTMLImageElement).loading = 'eager'))
  await page.waitForFunction(() => [...document.querySelectorAll('.thumb img')].every(image => (image as HTMLImageElement).complete))
  await page.screenshot({ path: `design-research/screenshots/after/${round}-review-${width}.png`, fullPage: true })
  await page.screenshot({ path: `design-research/screenshots/after/${round}-viewport-${width}.png` })
  console.log(width, await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > innerWidth, images: [...document.images].filter(i => i.naturalWidth > 0).length })))
  await page.close()
}
await browser.close()
