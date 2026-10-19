import { spawnSync } from 'node:child_process'
import { mkdirSync, realpathSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import {
  assertDockerReady,
  DOCKER_PLATFORM,
  ensureImage,
  installedPlaywrightVersion,
} from '../src/lib/docker.ts'
import { reviewFixture } from '../tests/helpers/review-fixture.ts'
import { siteFixture } from '../tests/helpers/site-fixture.ts'
import { assertScreenshot } from '../tests/helpers/visual.ts'

const update = process.argv.includes('--update')
if (process.argv.slice(2).some((arg) => arg !== '--update'))
  throw new Error('Usage: bun scripts/visual-tests.ts [--update]')

if (process.env.SPINE_VISUAL_CONTAINER !== '1') {
  assertDockerReady()
  const image = ensureImage(installedPlaywrightVersion(), console.log)
  const root = realpathSync(process.cwd())
  const baselines = resolve('tests/visual-baselines')
  const output = resolve('.design-spine/visual-results')
  mkdirSync(baselines, { recursive: true })
  mkdirSync(output, { recursive: true })
  const result = spawnSync(
    'docker',
    [
      'run',
      '--rm',
      '--init',
      '--platform',
      DOCKER_PLATFORM,
      '--network',
      'none',
      '--shm-size=256m',
      '-v',
      `${root}:/work:ro`,
      '-v',
      `${baselines}:/baselines:${update ? 'rw' : 'ro'}`,
      '-v',
      `${output}:/results`,
      '-w',
      '/work',
      '-e',
      'SPINE_VISUAL_CONTAINER=1',
      ...(process.platform === 'linux'
        ? ['--user', `${process.getuid?.()}:${process.getgid?.()}`]
        : []),
      image,
      'bun',
      'scripts/visual-tests.ts',
      ...(update ? ['--update'] : []),
    ],
    { stdio: 'inherit' },
  )
  if (result.error) throw result.error
  process.exit(result.status ?? 1)
}

const fixture = await reviewFixture()
const browser = await chromium.launch({ headless: true })
const website = await siteFixture()
let failures = 0
try {
  for (const width of [1260, 630, 390]) {
    for (const colorScheme of ['light', 'dark'] as const) {
      const page = await browser.newPage({
        viewport: { width, height: 800 },
        colorScheme,
        reducedMotion: 'reduce',
        locale: 'en-US',
        timezoneId: 'UTC',
      })
      page.setDefaultTimeout(15000)
      console.log(`Checking review at ${width}px in ${colorScheme}`)
      await page.goto(fixture.url)
      await page.getByText('Comparison ready', { exact: false }).waitFor()
      await page.locator('.thumb img').evaluateAll((images) =>
        Promise.all(
          images
            .filter((image) => {
              const rect = image.getBoundingClientRect()
              return rect.top < innerHeight && rect.bottom > 0
            })
            .map((image) => (image as HTMLImageElement).decode()),
        ),
      )
      const capture = async (name: string): Promise<void> => {
        await page.evaluate(() => {
          window.scrollTo(0, 0)
          ;(document.activeElement as HTMLElement)?.blur()
        })
        const screenshot = await page.screenshot({ animations: 'disabled' })
        try {
          assertScreenshot(
            screenshot,
            `/baselines/${name}-${width}-${colorScheme}.png`,
            '/results',
            update,
          )
          console.log(`${update ? 'Updated' : 'Passed'} ${name}-${width}-${colorScheme}`)
        } catch (error) {
          console.error((error as Error).message)
          failures++
        }
      }
      await capture('review')
      if (width !== 630) {
        await page.locator('#coverage-summary').click()
        await capture('coverage')
        await page.locator('#coverage-summary').click()
        await page.locator('.inspect').first().click()
        await page
          .locator('#viewer-image')
          .evaluate((image) => (image as HTMLImageElement).decode())
        await capture('inspector')
      }
      await page.close()
    }
  }
  for (const width of [1260, 390]) {
    const page = await browser.newPage({
      viewport: { width, height: 800 },
      reducedMotion: 'reduce',
      locale: 'en-US',
      timezoneId: 'UTC',
    })
    await page.route('https://fonts.googleapis.com/**', (route) => route.abort())
    await page.goto(website.url)
    await page.getByRole('button', { name: 'Difference', exact: true }).click()
    const screenshot =
      width === 390
        ? await page.locator('.demo').screenshot({ animations: 'disabled' })
        : await page.screenshot({ animations: 'disabled' })
    try {
      assertScreenshot(screenshot, `/baselines/website-${width}.png`, '/results', update)
      console.log(`${update ? 'Updated' : 'Passed'} website-${width}`)
    } catch (error) {
      console.error((error as Error).message)
      failures++
    }
    await page.close()
  }
} finally {
  await browser.close()
  fixture.close()
  await website.close()
}
process.exitCode = failures ? 1 : 0
