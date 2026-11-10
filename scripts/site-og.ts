// Renders site/og.png (1200x630) from the page itself, so the share image cannot drift from the site.
// Usage: bun scripts/site-og.ts
import { writeFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { siteFixture } from '../tests/helpers/site-fixture.ts'

const site = await siteFixture()
const browser = await chromium.launch()
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    colorScheme: 'light',
    reducedMotion: 'reduce',
  })
  await page.goto(site.url, { waitUntil: 'networkidle' })
  await page.addStyleTag({
    content:
      'nav.top .links,.lede,.cta,.demo{display:none!important}' +
      '.hero{display:block}.hero h1{font-size:56px;max-width:none;margin-top:4px}' +
      '.sheet{margin-top:26px}.wrap{padding:0 40px}',
  })
  await page.evaluate(() => document.fonts.ready)
  writeFileSync(
    'site/og.png',
    await page.screenshot({ clip: { x: 0, y: 0, width: 1200, height: 630 } }),
  )
  console.log('Wrote site/og.png')
} finally {
  await browser.close()
  await site.close()
}
