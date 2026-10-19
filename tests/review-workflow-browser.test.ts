import AxeBuilder from '@axe-core/playwright'
import { chromium } from 'playwright'
import { expect, it } from 'vitest'
import { reviewFixture } from './helpers/review-fixture.ts'

it('opens exact matrix evidence across filters and pages while exposing missing coverage', async () => {
  const fixture = await reviewFixture({ missingApprovedCapture: true })
  const browser = await chromium.launch()
  try {
    const context = await browser.newContext({ viewport: { width: 1260, height: 800 } })
    const page = await context.newPage()
    await page.goto(fixture.url)
    await page.getByText('Comparison ready', { exact: false }).waitFor()
    expect(await page.locator('.tile').count()).toBe(48)
    await page.locator('#page-next').click()
    expect(await page.locator('.tile').count()).toBe(16)
    await page.getByLabel('Search routes or states').fill('/projects/0')
    await page.locator('#coverage-summary').click()
    const matrix = page.getByRole('table', { name: 'Capture coverage' })
    await matrix.waitFor({ timeout: 2000 })
    expect(await matrix.getByText('Missing capture', { exact: true }).count()).toBe(2)
    expect(
      await matrix
        .getByRole('button', {
          name: '/projects/0 · ideal · 390px · light · Missing capture',
          exact: true,
        })
        .isDisabled(),
    ).toBe(true)
    expect(await matrix.getByText('Unfinished', { exact: true }).count()).toBe(1)
    expect(await matrix.getByText('Excluded', { exact: true }).count()).toBe(1)
    expect(await matrix.getByText('Filtered out', { exact: true }).count()).toBe(1)
    expect(await matrix.getByText('Not captured', { exact: true }).count()).toBe(1)
    expect(await matrix.getByText('Failed', { exact: true }).count()).toBe(1)
    const target = matrix.getByRole('button', {
      name: '/projects/a-very-long-project-name/releases/review-workflow-improvements · ideal · 1280px · dark · Pending',
      exact: true,
    })
    await target.click()
    expect(new URL(page.url()).searchParams.get('tile')).toBe('route-7-ideal-1280-dark')
    expect(await page.locator('#search').inputValue()).toBe('')
    await page.getByRole('button', { name: 'Approve', exact: true }).click()
    await page.getByText('All changes saved locally.', { exact: true }).waitFor()
    await page.getByRole('button', { name: 'Close', exact: true }).click()
    await page.waitForFunction(() => !new URL(location.href).searchParams.has('tile'))
    expect(
      await matrix
        .getByRole('button', {
          name: '/projects/a-very-long-project-name/releases/review-workflow-improvements · ideal · 1280px · dark · Approved',
          exact: true,
        })
        .count(),
    ).toBe(1)
    expect(
      await page.evaluate(() => document.activeElement?.closest('#coverage-matrix') !== null),
    ).toBe(true)
    const accessibility = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()
    expect(accessibility.violations.map((issue) => issue.id)).toEqual([])
  } finally {
    await browser.close()
    fixture.close()
  }
}, 60000)

it('shows evidence above the mobile fold and keeps secondary filters accessible', async () => {
  const fixture = await reviewFixture()
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 800 } })
    await page.goto(fixture.url)
    await page.getByText('Comparison ready', { exact: false }).waitFor()
    const thumb = await page.locator('.thumb').first().boundingBox()
    expect(thumb?.y).toBeLessThan(600)
    expect(
      await page.getByRole('combobox', { name: 'Review status', exact: true }).isVisible(),
    ).toBe(false)
    await page.getByRole('button', { name: 'Filters', exact: true }).click()
    await page.getByRole('combobox', { name: 'Review status', exact: true }).selectOption('reject')
    expect(await page.locator('.tile').count()).toBe(2)
    await page.getByRole('button', { name: 'Filters (1 active)', exact: true }).click()
    expect(
      await page.getByRole('combobox', { name: 'Review status', exact: true }).isVisible(),
    ).toBe(false)
    await page.locator('.actions .approve').first().click()
    await page.getByText('All changes saved locally.', { exact: true }).waitFor()
    expect((await page.locator('#save-status').boundingBox())?.height).toBeLessThan(65)
    await page.setViewportSize({ width: 1260, height: 800 })
    expect(
      await page.getByRole('combobox', { name: 'Review status', exact: true }).isVisible(),
    ).toBe(true)
  } finally {
    await browser.close()
    fixture.close()
  }
}, 60000)
