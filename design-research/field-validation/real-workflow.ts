import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { chromium } from 'playwright'
import { PNG } from 'pngjs'
import { startReviewServer } from '../../src/lib/server.ts'
import { writeJson } from '../../src/lib/runs.ts'

const out = 'design-research/field-validation'
mkdirSync(join(out, '.design-spine/runs'), { recursive: true })
const root = mkdtempSync(join(process.cwd(), out, '.design-spine/runs/real-app-'))
const checks: any[] = [], commands: any[] = []
function check(name: string, passed: boolean): void { checks.push({ name, passed }); if (!passed) throw new Error(name) }
async function command(args: string[], expected = 0): Promise<void> {
  const child = Bun.spawn(['bun', resolve('src/cli.ts'), ...args], { cwd: root, env: { ...process.env, SPINE_CWD: root }, stdout: 'pipe', stderr: 'pipe' })
  const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
  commands.push({ args, stdout, stderr, code }); check(`CLI ${args.join(' ')}`, code === expected)
}
writeJson(join(root, 'design-spine.json'), {
  baseUrl: 'http://127.0.0.1:4174', viewports: [390, 1280],
  themes: { light: 'light', dark: 'dark', method: 'media' },
  routes: ['/', '/templates', '/try', '/help', '/login', '/forgot-password'].map(path => ({ path, states: [{ name: 'ideal' }] })),
})
let server: ReturnType<typeof startReviewServer> | undefined
const browser = await chromium.launch()
try {
  const discovery = await browser.newPage()
  await discovery.goto('http://127.0.0.1:4174', { waitUntil: 'networkidle' })
  check('local target is the verified owned Create Surveys application', (await discovery.title()).includes('Create Surveys'))
  await discovery.close()
  await command(['capture', '--base', 'http://127.0.0.1:4174', '--concurrency', '2'])
  const dir = realpathSync(join(root, '.design-spine/latest'))
  const run = JSON.parse(readFileSync(join(dir, 'run.json'), 'utf8'))
  check('24 actual app captures created without capture failures', run.tiles.length === 24 && run.tiles.every((tile: any) => !tile.error && tile.status === 200))
  const target = run.tiles.find((tile: any) => tile.route === '/templates' && tile.viewport === 1280 && tile.theme === 'light')
  check('stable public template capture present', !!target)
  for (const tile of run.tiles) copyFileSync(join(dir, tile.file), join(out, `app-${tile.file}`))
  writeJson(join(out, 'real-app-run.json'), run)
  server = startReviewServer(dir, 0)
  const base = `http://localhost:${server.port}`
  for (const width of [1280, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } })
    const errors: string[] = []; page.on('pageerror', e => errors.push(e.message))
    await page.goto(base)
    await page.waitForFunction(() => document.querySelector('#comparison-status')?.textContent?.startsWith('Comparison ready'))
    check(`${width}: actual app capture library loaded`, await page.locator('.tile').count() === 24)
    await page.locator('#search').fill('/templates')
    await page.locator('#viewport-filter').selectOption('1280')
    await page.locator('#theme-filter').selectOption('light')
    check(`${width}: combined filters identify exact real capture`, await page.locator('.tile').count() === 1)
    await page.getByRole('button', { name: 'Inspect screenshot', exact: true }).click()
    await page.locator('#viewer-image').evaluate((img: HTMLImageElement) => img.decode())
    check(`${width}: viewer decodes actual full capture`, await page.locator('#viewer-image').evaluate((img: HTMLImageElement) => img.naturalWidth === 1280))
    await page.screenshot({ path: join(out, `real-viewer-${width}.png`) })
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Approve', exact: true }).click()
    const note = `Isolated workflow validation at ${width}px; not a production baseline approval.`
    await page.locator('.tile textarea').fill(note)
    await page.locator('.tile textarea').press('Tab')
    await page.waitForFunction(() => document.querySelector('#save-status')?.textContent === 'All changes saved locally.')
    const saved = JSON.parse(readFileSync(join(dir, 'review.json'), 'utf8')).tiles[target.id]
    // A second click toggles approval; set the intended decision explicitly for the second session.
    if (saved.decision !== 'approve') {
      await page.getByRole('button', { name: 'Approve', exact: true }).click()
      await page.waitForFunction(() => document.querySelector('#save-status')?.textContent === 'All changes saved locally.')
    }
    check(`${width}: exact note reaches disk`, JSON.parse(readFileSync(join(dir, 'review.json'), 'utf8')).tiles[target.id].note === note)
    const downloaded = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export review' }).click()
    const download = await downloaded
    await download.saveAs(join(out, `real-export-${width}.json`))
    const exported = JSON.parse(readFileSync(join(out, `real-export-${width}.json`), 'utf8'))
    check(`${width}: export contains whole run and confirmed decision/note`, exported.run.tiles.length === 24 && exported.review.tiles[target.id].note === note && exported.review.tiles[target.id].decision === 'approve')
    await page.reload(); await page.locator('.tile').first().waitFor()
    await page.locator('#search').fill('/templates'); await page.locator('#viewport-filter').selectOption('1280'); await page.locator('#theme-filter').selectOption('light')
    check(`${width}: fresh load retains note and decision`, await page.locator('.tile textarea').inputValue() === note && await page.getByRole('button', { name: 'Approve', exact: true }).getAttribute('aria-pressed') === 'true')
    await page.screenshot({ path: join(out, `real-review-${width}.png`), fullPage: true })
    check(`${width}: no review page errors or overflow`, !errors.length && await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    await page.close()
  }
  await command(['approve'])
  const baselines = join(root, '.design-spine/baselines')
  check('only one explicitly approved isolated baseline promoted', Object.keys(JSON.parse(readFileSync(join(baselines, 'manifest.json'), 'utf8')).tiles).length === 1)
  check('baseline bytes exactly match original real capture', readFileSync(join(baselines, target.file)).equals(readFileSync(join(dir, target.file))))
  await command(['diff'])
  const unchanged = JSON.parse(readFileSync(join(dir, 'diff.json'), 'utf8'))
  writeJson(join(out, 'real-diff-unchanged.json'), unchanged)
  check('unapproved captures stay new', unchanged.rows.filter((r: any) => r.result === 'new').length === 23)
  const changedDir = join(root, '.design-spine/runs/controlled-change')
  mkdirSync(changedDir, { recursive: true })
  writeJson(join(changedDir, 'run.json'), { ...run, id: 'controlled-change', tiles: [target] })
  const png = PNG.sync.read(readFileSync(join(dir, target.file)))
  for (let y = 0; y < Math.min(240, png.height); y++) for (let x = 0; x < Math.min(640, png.width); x++) {
    const i = (y * png.width + x) * 4; png.data[i] = 255; png.data[i + 1] = 0; png.data[i + 2] = 255; png.data[i + 3] = 255
  }
  writeFileSync(join(changedDir, target.file), PNG.sync.write(png))
  await command(['diff', '--run', changedDir], 1)
  writeJson(join(out, 'real-diff-changed.json'), JSON.parse(readFileSync(join(changedDir, 'diff.json'), 'utf8')))
  check('controlled change never mutates original capture or baseline', readFileSync(join(baselines, target.file)).equals(readFileSync(join(dir, target.file))))
  await command(['status'])
} finally {
  writeJson(join(out, 'real-workflow-results.json'), { root, checks, commands, scope: 'Fresh anonymous contexts, six public local Create Surveys routes. No login, form submission, cloud data access, app source edits or production baseline mutation. Theme uses OS media; app may choose a fixed appearance. Controlled pixel change affects only an isolated copy.' })
  await browser.close(); server?.stop()
}
console.log(`${checks.length} real-project workflow checks passed`)
