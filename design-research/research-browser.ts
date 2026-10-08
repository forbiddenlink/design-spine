import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'

const browser = await chromium.launch()
const entries = process.argv.slice(2)
const results = await Promise.all(entries.map(async entry => {
  const [name, ...parts] = entry.split('=')
  const url = parts.join('=')
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 })
    await page.waitForTimeout(6500)
    await page.screenshot({ path: `design-research/screenshots/references/${name}.png` })
    const result = { name, requested: url, url: page.url(), status: response?.status(), title: await page.title(), text: await page.locator('body').innerText(), links: await page.locator('a[href]').evaluateAll(anchors => anchors.map(a => ({ text: a.textContent?.trim(), url: (a as HTMLAnchorElement).href }))) }
    writeFileSync(`design-research/${name}.json`, JSON.stringify(result, null, 2))
    return { name, status: result.status, url: result.url, title: result.title }
  } catch (error) {
    const result = { name, url, blocked: String(error) }
    writeFileSync(`design-research/${name}.json`, JSON.stringify(result, null, 2))
    return result
  } finally { await page.close() }
}))
console.log(JSON.stringify(results, null, 2))
await browser.close()
