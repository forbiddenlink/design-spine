import { chromium } from 'playwright'
import { writeFileSync, readFileSync } from 'node:fs'
const phase = process.argv.includes('--after') ? 'after' : 'before'
const base = 'http://localhost:14747'
const source = await (await fetch(base + '/api/run')).json()
const browser = await chromium.launch()
const results = []
const screenshotsOnly = process.argv.includes('--screens-only')
try {
 for (const width of [1280, 390]) for (const count of (screenshotsOnly ? [1000] : [100, 500, 1000])) {
  const page = await browser.newPage({ viewport: { width, height: 900 } })
  const cdp = await page.context().newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  const tiles = Array.from({ length: count }, (_, index) => ({ ...source.run.tiles[index % source.run.tiles.length], id: 'synthetic-' + index, route: '/route-' + String(Math.floor(index / 20)).padStart(3, '0'), state: 'state-' + index % 5 }))
  const data = { ...source, run: { ...source.run, id: 'synthetic-scale-' + count, tiles }, review: { tiles: {} }, comparison: { threshold: 0.002, tiles: Object.fromEntries(tiles.map(t => [t.id, { status: 'new' }])) } }
  if (phase === 'before') await page.route(base + '/', route => route.fulfill({ contentType: 'text/html', body: readFileSync('design-research/scale-baseline-ui.html', 'utf8') }))
  await page.route('**/api/run*', route => route.fulfill({ json: data }))
  await page.goto(base)
  await page.locator('#cards[aria-busy="false"]').waitFor()
  const result = await page.evaluate(() => {
   const firstRenderMilliseconds = performance.now()
   const times = []
   const search = document.querySelector('#search') as HTMLInputElement
   for (const query of ['route-000', '', 'state-1', '']) { const start = performance.now(); search.value = query; search.dispatchEvent(new Event('input', { bubbles: true })); times.push({ query, milliseconds: performance.now() - start }) }
   return { filterTimes: times, renderedTiles: document.querySelectorAll('.tile').length, domElements: document.querySelectorAll('*').length, overflow: document.documentElement.scrollWidth > innerWidth, firstRenderMilliseconds, measurementEndMilliseconds: performance.now() }
  })
  results.push({ width, count, cpuThrottle: 4, ...result })
  if (count === 1000) await page.screenshot({ path: `design-research/screenshots/after/scale-${phase}-${width}.png` })
  await page.close()
 }
 if (!screenshotsOnly) writeFileSync(`design-research/scale-${phase}.json`, JSON.stringify(results, null, 2))
 console.log(JSON.stringify(results, null, 2))
} finally { await browser.close() }
