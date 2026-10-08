import { chromium } from 'playwright'

const browser = await chromium.launch()
for (const width of [1280, 390]) {
  const page = await browser.newPage({ viewport: { width, height: 900 } })
  await page.goto('http://localhost:14747')
  await page.locator('.tile').first().waitFor()
  await page.screenshot({ path: `design-research/screenshots/before/review-${width}.png`, fullPage: true })
  await page.locator('.thumb img').first().click()
  await page.screenshot({ path: `design-research/screenshots/before/viewer-${width}.png` })
  await page.keyboard.press('Escape')
  await page.route('**/api/run*', async route => {
    const response = await route.fetch()
    const data = await response.json()
    data.run.tiles = []
    await route.fulfill({ json: data })
  })
  await page.reload()
  await page.locator('.empty').waitFor()
  await page.screenshot({ path: `design-research/screenshots/before/empty-${width}.png` })
  await page.close()
}
await browser.close()
