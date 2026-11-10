import AxeBuilder from '@axe-core/playwright'
import { chromium } from 'playwright'
import { expect, it } from 'vitest'
import { reviewFixture } from './helpers/review-fixture.ts'

it.each([390, 1260])(
  'filters capture warnings and exposes request details at %ipx',
  async (width) => {
    const fixture = await reviewFixture({ diagnostics: true })
    const browser = await chromium.launch()
    try {
      const context = await browser.newContext({ viewport: { width, height: 800 } })
      const page = await context.newPage()
      page.setDefaultTimeout(3000)
      await page.goto(fixture.url)
      await page.getByText('Comparison ready', { exact: false }).waitFor()
      await page.locator('#page-next').click()
      if (width === 390) await page.locator('#toggle-filters').click()
      const warnings = page.getByRole('button', { name: 'Only capture warnings', exact: true })
      await warnings.click()
      expect(await warnings.getAttribute('aria-pressed')).toBe('true')
      expect(await page.locator('.tile').count()).toBe(2)
      expect(await page.locator('.badge.warn').allTextContents()).toEqual([
        '1 capture warning',
        '1 capture warning',
      ])
      expect(await page.locator('#toggle-filters').textContent()).toBe('Filters (1 active)')
      await page.locator('#viewport-filter').selectOption('390')
      expect(await page.locator('.tile').count()).toBe(1)
      await page.locator('#f-flagged').click()
      expect(await page.locator('.tile').count()).toBe(0)
      await page.locator('#clear-filters').click()
      expect(await warnings.getAttribute('aria-pressed')).toBe('false')
      expect(await page.locator('.tile').count()).toBe(48)
      await page.locator('#f-flagged').click()
      expect(await page.locator('.tile').count()).toBe(2)
      const tile = page.locator('.tile').filter({ hasText: '2 failed requests' })
      if ((await tile.locator('.tile-more').getAttribute('open')) === null)
        await tile.locator('.tile-more > summary').click()
      await tile.getByText('Diagnostic details (2)', { exact: true }).click()
      expect(await tile.locator('.diagnostics li').allTextContents()).toEqual([
        'Request: HTTP 429 · fetch · +123 ms · https://example.test/api/<unsafe>',
        'Request: net::ERR_FAILED · image · +456 ms · https://example.test/image.png',
      ])
      expect(await tile.locator('unsafe').count()).toBe(0)
      const accessibility = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
      expect(accessibility.violations.map((issue) => issue.id)).toEqual([])
    } finally {
      await browser.close()
      fixture.close()
    }
  },
  60000,
)

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

it.each([390, 1260])(
  'keeps keyboard navigation usable after the last filtered card disappears at %ipx',
  async (width) => {
    const fixture = await reviewFixture()
    const browser = await chromium.launch()
    try {
      const page = await browser.newPage({ viewport: { width, height: 800 } })
      await page.goto(fixture.url)
      await page.getByText('Comparison ready', { exact: false }).waitFor()
      if (width === 390) await page.getByRole('button', { name: 'Filters', exact: true }).click()
      await page
        .getByRole('combobox', { name: 'Review status', exact: true })
        .selectOption('reject')
      await page.getByRole('combobox', { name: 'Viewport', exact: true }).selectOption('390')
      expect(await page.locator('.tile').count()).toBe(1)
      if (width === 390)
        await page.getByRole('button', { name: 'Filters (2 active)', exact: true }).click()
      await page.locator('.actions .approve').click()
      await page.waitForFunction(() => document.querySelectorAll('.tile').length === 0)
      const target =
        width === 390 ? page.locator('#toggle-filters') : page.locator('#clear-filters')
      expect(await target.evaluate((button) => document.activeElement === button)).toBe(true)
      await page.keyboard.press('Enter')
      if (width === 390) await page.locator('#clear-filters').click()
      expect(await page.locator('.tile').count()).toBe(48)
    } finally {
      await browser.close()
      fixture.close()
    }
  },
  60000,
)

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
    await page.locator('.inspect').first().click()
    await page.getByRole('button', { name: 'Approve', exact: true }).click()
    await page.waitForFunction(() => !new URL(location.href).searchParams.has('tile'))
    expect(await page.locator('.tile').count()).toBe(0)
    expect(
      await page
        .getByRole('button', { name: 'Filters (1 active)', exact: true })
        .evaluate((button) => document.activeElement === button),
    ).toBe(true)
    await page.keyboard.press('Enter')
    await page.locator('#clear-filters').click()
    expect(await page.locator('.tile').count()).toBe(48)
    await page.setViewportSize({ width: 1260, height: 800 })
    expect(
      await page.getByRole('combobox', { name: 'Review status', exact: true }).isVisible(),
    ).toBe(true)
  } finally {
    await browser.close()
    fixture.close()
  }
}, 60000)

it('shows check evidence on the thumbnail and in the coverage matrix before inspection', async () => {
  const fixture = await reviewFixture({ evidence: true })
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({ viewport: { width: 1260, height: 800 } })
    await page.goto(fixture.url)
    await page.getByText('Comparison ready', { exact: false }).waitFor()
    expect(await page.locator('.thumb.overflow-x').count()).toBe(1)
    const card = page.locator('.tile', { has: page.locator('.thumb.overflow-x') })
    expect(await card.locator('.thumb-evidence rect.blank').count()).toBe(1)
    expect(await card.locator('.thumb-evidence rect.overflow').count()).toBe(1)
    await card.locator('.thumb img').evaluate((image) => (image as HTMLImageElement).decode())
    const overlay = await card.locator('.thumb-evidence').getAttribute('viewBox')
    expect(overlay).toBe('0 0 1280 600')
    expect(await page.locator('.thumb-evidence').count()).toBe(1)
    await page.locator('#coverage-summary').click()
    const flagged = page.locator('.coverage-cell[data-flagged]')
    expect(await flagged.count()).toBe(1)
    expect(await flagged.textContent()).toBe('✓ Approved · 2 flags')
    expect(await flagged.getAttribute('aria-label')).toContain('Approved · 2 flags')
  } finally {
    await browser.close()
    fixture.close()
  }
}, 30000)

it('switches to the contact sheet, keeps keyboard review working, and remembers the view', async () => {
  const fixture = await reviewFixture()
  const browser = await chromium.launch()
  try {
    const context = await browser.newContext({ viewport: { width: 1260, height: 800 } })
    const page = await context.newPage()
    await page.goto(fixture.url)
    await page.getByText('Comparison ready', { exact: false }).waitFor()
    const cardWidth = (await page.locator('.tile').first().boundingBox())?.width ?? 0
    const toggle = page.getByRole('button', { name: 'Contact sheet' })
    await toggle.click()
    expect(await toggle.getAttribute('aria-pressed')).toBe('true')
    expect((await page.locator('.tile').first().boundingBox())?.width).toBeLessThan(cardWidth)
    expect(await page.locator('.tile .actions').first().isVisible()).toBe(false)
    await page.keyboard.press('j')
    await page.keyboard.press('j')
    await page.keyboard.press('j')
    const focused = page.locator('.tile.focus')
    const wasApproved = await focused.evaluate((card) => card.classList.contains('approved'))
    await page.keyboard.press(wasApproved ? 'r' : 'a')
    await page.locator(`.tile.focus.${wasApproved ? 'rejected' : 'approved'}`).waitFor()
    const accessibility = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()
    expect(accessibility.violations.map((issue) => issue.id)).toEqual([])
    await page.reload()
    await page.getByText('Comparison ready', { exact: false }).waitFor()
    expect(await page.evaluate(() => document.body.dataset.view)).toBe('sheet')
    await page.getByRole('button', { name: 'Contact sheet' }).click()
    expect(await page.evaluate(() => document.body.dataset.view)).toBeUndefined()
  } finally {
    await browser.close()
    fixture.close()
  }
}, 30000)
