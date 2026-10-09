import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'
const browser = await chromium.launch()
const results: unknown[] = []
try {
 for (const width of [1280, 390]) for (const theme of ['light', 'dark'] as const) {
  const page = await browser.newPage({ viewport: { width, height: 900 }, colorScheme: theme })
  await page.goto('http://localhost:14870'); await page.locator('.tile').first().waitFor()
  await page.locator('.inspect').first().click(); await page.locator('.viewer-note summary').click()
  await page.locator('#viewer-note-help').scrollIntoViewIfNeeded()
  await page.addScriptTag({ path: 'design-research/.tool-cache/_npx/1722e863ebfd623b/node_modules/axe-core/axe.min.js' })
  const result = await page.evaluate(async () => {
   const node = document.querySelector('#viewer-note-help')!
   const style = getComputedStyle(node); const rect = node.getBoundingClientRect()
   const audit = await (window as any).axe.run(node, { runOnly: ['color-contrast'] })
   const rgb = (value: string): number[] => (value.match(/[\d.]+/g) || []).slice(0, 3).map(Number)
   const luminance = (value: string): number => rgb(value).map(v => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0)
   const fg = luminance(style.color); const bg = luminance(style.backgroundColor)
   return { fontSize: style.fontSize, color: style.color, background: style.backgroundColor, ratio: (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05), visibleAtCenter: document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2) === node, violations: audit.violations, incomplete: audit.incomplete }
  })
  results.push({ width, theme, ...result })
  if (result.ratio < 4.5 || result.violations.length || result.incomplete.length || !result.visibleAtCenter) throw new Error('Visible note helper contrast check failed')
  await page.close()
 }
} finally { await browser.close(); writeFileSync('design-research/review-workflow/contrast.json', JSON.stringify(results, null, 2) + '\n') }
console.log('4 fully visible note-help contrast checks passed')
