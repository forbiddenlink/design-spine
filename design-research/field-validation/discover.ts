import { chromium } from 'playwright'
import { writeJson } from '../../src/lib/runs.ts'
const browser = await chromium.launch()
try {
  const page = await browser.newPage()
  const response = await page.goto('http://127.0.0.1:4174/', { waitUntil: 'networkidle' })
  const data = await page.evaluate(() => ({ title: document.title, heading: document.querySelector('h1')?.textContent, links: [...document.querySelectorAll<HTMLAnchorElement>('a')].map(a => ({ label: a.textContent?.trim(), href: a.getAttribute('href') })), themeKeys: Object.keys(localStorage).filter(key => /theme/i.test(key)) }))
  writeJson('design-research/field-validation/app-discovery.json', { status: response?.status(), ...data })
  await page.screenshot({ path: 'design-research/field-validation/app-discovery.png', fullPage: true })
  console.log(JSON.stringify({ status: response?.status(), title: data.title, themeKeys: data.themeKeys, routes: data.links.filter(a => a.href?.startsWith('/')).map(a => a.href) }))
} finally { await browser.close() }
