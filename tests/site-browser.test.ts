import AxeBuilder from '@axe-core/playwright'
import { chromium } from 'playwright'
import { expect, it } from 'vitest'
import { siteFixture } from './helpers/site-fixture.ts'

it('lets visitors inspect, compare, reject and reset an example without writing a review', async () => {
  const fixture = await siteFixture()
  const browser = await chromium.launch()
  try {
    const context = await browser.newContext({ viewport: { width: 1260, height: 800 } })
    const page = await context.newPage()
    await page.route('https://fonts.googleapis.com/**', (route) => route.abort())
    const writes: string[] = []
    page.on('request', (request) => {
      if (request.method() !== 'GET') writes.push(request.url())
    })
    await page.goto(fixture.url)
    const demo = page.getByRole('region', { name: 'Try a review' })
    await demo.waitFor({ timeout: 2000 })
    expect((await demo.boundingBox())?.y).toBeLessThan(300)
    await demo.getByRole('button', { name: 'Baseline', exact: true }).click()
    expect(await demo.locator('.demo-obstruction').isVisible()).toBe(false)
    await demo.getByRole('button', { name: 'Difference', exact: true }).click()
    expect(await demo.locator('.demo-obstruction').isVisible()).toBe(true)
    expect(await demo.getByText('Banner covers the action.', { exact: true }).isVisible()).toBe(
      true,
    )
    await demo.getByLabel('Review note').fill('Keep the action visible on mobile.')
    await demo.getByRole('button', { name: 'Reject example' }).click()
    expect(await demo.getByRole('status').textContent()).toContain(
      'Keep the action visible on mobile.',
    )
    await demo.getByRole('button', { name: 'Reset example' }).click()
    expect(await demo.getByLabel('Review note').inputValue()).toBe('')
    expect(await demo.getByRole('status').textContent()).toContain('Pending')
    await page.setViewportSize({ width: 390, height: 800 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    const accessibility = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()
    expect(
      accessibility.violations.map((issue) => ({
        id: issue.id,
        targets: issue.nodes.map((node) => node.target),
      })),
    ).toEqual([])
    expect(writes).toEqual([])
  } finally {
    await browser.close()
    await fixture.close()
  }
}, 30000)
