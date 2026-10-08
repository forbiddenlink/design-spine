import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'

const browser = await chromium.launch()
const results = []
for (const width of [1280, 390]) {
  for (const theme of ['light', 'dark'] as const) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, colorScheme: theme })
    await page.goto('http://localhost:14850')
    await page.locator('.tile').first().waitFor()
    await page.addScriptTag({ path: 'design-research/.tool-cache/_npx/1722e863ebfd623b/node_modules/axe-core/axe.min.js' })
    for (const view of ['review', 'viewer']) {
      if (view === 'viewer') await page.getByRole('button', { name: 'Inspect screenshot', exact: true }).first().click()
      const result = await page.evaluate(async () => (window as any).axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice'] } }))
      results.push({ width, theme, view, violations: result.violations.map((v: any) => ({ id: v.id, impact: v.impact, description: v.description, nodes: v.nodes.map((n: any) => ({ target: n.target, failureSummary: n.failureSummary })) })), incomplete: result.incomplete.map((v: any) => ({ id: v.id, description: v.description })) })
    }
    await page.close()
  }
}
writeFileSync('functional-review/evidence/accessibility-checks.json', JSON.stringify(results, null, 2))
console.log(JSON.stringify(results.map(r => ({ width: r.width, theme: r.theme, view: r.view, violations: r.violations })), null, 2))
await browser.close()
if (results.some(r => r.violations.length)) process.exitCode = 1
