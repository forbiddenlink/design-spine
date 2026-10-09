import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { chromium } from 'playwright'
import { PNG } from 'pngjs'
import { startReviewServer } from '../../src/lib/server.ts'
import { writeJson } from '../../src/lib/runs.ts'

const out = 'design-research/field-validation/recovery'
mkdirSync(join(out, '.design-spine/runs'), { recursive: true })
const root = mkdtempSync(join(process.cwd(), out, '.design-spine/runs/session-'))
const dir = join(root, 'runs/current'); const baselines = join(root, 'baselines')
mkdirSync(dir, { recursive: true }); mkdirSync(baselines)
const source = JSON.parse(readFileSync('design-research/.design-spine/runs/2026-10-08T15-32-24-858Z/run.json', 'utf8'))
const png = new PNG({ width: 40, height: 60 }); png.data.fill(255)
const tiles = ['changed', 'unchanged', 'new', 'size-changed', 'unavailable', 'no-capture'].map((name, i) => ({ ...source.tiles[0], id: name, file: name + '.png', route: '/' + name, blankRegions: { count: 0, boxes: [] }, error: i === 5 ? 'Generated missing capture' : undefined }))
const { writeFileSync } = await import('node:fs')
for (const [i, tile] of tiles.entries()) {
  const current = PNG.sync.read(PNG.sync.write(png))
  if (i === 0) for (let offset = 0; offset < current.data.length; offset += 4) { current.data[offset + 1] = 0; current.data[offset + 2] = 0 }
  if (i !== 5) writeFileSync(join(dir, tile.file), PNG.sync.write(current))
  if (i !== 2 && i !== 5) writeFileSync(join(baselines, tile.file), i === 4 ? 'Generated invalid PNG' : PNG.sync.write(i === 3 ? new PNG({ width: 20, height: 60 }) : png))
}
writeJson(join(dir, 'run.json'), { ...source, tiles }); writeJson(join(dir, 'review.json'), { tiles: {} })
const server = startReviewServer(dir, 0); const base = `http://localhost:${server.port}`
const browser = await chromium.launch(); const checks: unknown[] = []; const contrast: any[] = []; const audits: unknown[] = []; const start = performance.now()
function check(name: string, passed: boolean): void { checks.push({ name, passed }); if (!passed) throw new Error(name) }
try {
  for (const width of [1280, 390]) for (const theme of ['light', 'dark'] as const) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, colorScheme: theme }); const errors: string[] = []
    page.on('pageerror', e => errors.push(e.message))
    if (theme === 'light') {
      const old = spawnSync('git', ['show', '911c6b6:src/ui/index.html'], { encoding: 'utf8' }); if (old.status !== 0) throw new Error(old.stderr)
      await page.route(base + '/', route => route.fulfill({ contentType: 'text/html', body: old.stdout }))
      await page.goto(base); await page.locator('#route-nav a').first().waitFor(); await page.locator('#route-nav a').first().hover()
      await page.waitForTimeout(180)
      await page.screenshot({ path: join(out, `routes-before-light-${width}.png`) }); await page.unroute(base + '/')
    }
    await page.goto(base); await page.waitForFunction(() => document.querySelector('#comparison-status')?.textContent?.startsWith('Comparison ready'))
    const comparison = await (await fetch(base + '/api/comparison')).json()
    check(`${width}/${theme}: all six real comparison states preserved`, tiles.every(t => comparison.tiles[t.id].status === t.id))
    await page.addScriptTag({ path: 'design-research/.tool-cache/_npx/1722e863ebfd623b/node_modules/axe-core/axe.min.js' })
    for (let i = 0; i < 6; i++) {
      const link = page.locator('#route-nav a').nth(i)
      await link.evaluate(el => el.scrollIntoView({ inline: 'center', block: 'nearest' }))
      for (const mode of ['normal', 'hover', 'keyboard-focus']) {
        await page.mouse.move(width - 1, 899)
        if (mode === 'hover') await link.hover()
        if (mode === 'keyboard-focus') { if (i === 0) await link.focus(); else { await page.locator('#route-nav a').nth(i - 1).focus(); await page.keyboard.press('Tab') } }
        await page.waitForTimeout(180)
        const result = await link.evaluate(el => {
          function rgb(value: string): number[] { return value.match(/[\d.]+/g)!.map(Number) }
          function luminance(c: number[]): number { const a = c.slice(0, 3).map(v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4 }); return .2126 * a[0] + .7152 * a[1] + .0722 * a[2] }
          function sample(node: Element) { let parent: Element | null = node; let bg = ''
            while (parent) { const value = getComputedStyle(parent).backgroundColor; const rgba = rgb(value); if (rgba.length === 3 || rgba[3] === 1) { bg = value; break } parent = parent.parentElement }
            if (!bg) throw new Error('No opaque background found')
            const fg = getComputedStyle(node).color; const a = luminance(rgb(fg)); const b = luminance(rgb(bg)); return { foreground: fg, background: bg, ratio: (Math.max(a, b) + .05) / (Math.min(a, b) + .05) }
          }
          const r = el.getBoundingClientRect(); const nav = el.parentElement!.getBoundingClientRect()
          return { link: sample(el), count: sample(el.querySelector('span')!), visible: r.left >= nav.left - 1 && r.right <= nav.right + 1, focused: document.activeElement === el }
        })
        contrast.push({ width, theme, index: i, mode, ...result })
        check(`${width}/${theme}/${i}/${mode}: readable route and count`, result.visible && result.link.ratio >= 4.5 && result.count.ratio >= 4.5 && (mode !== 'keyboard-focus' || result.focused))
      }
      const audit = await page.evaluate(async () => (window as any).axe.run('#route-nav', { runOnly: ['color-contrast'] }))
      audits.push({ width, theme, index: i, violations: audit.violations, incomplete: audit.incomplete })
      check(`${width}/${theme}/${i}: visible route has no contrast violation`, audit.violations.length === 0)
    }
    await page.locator('#route-nav a').last().evaluate(el => el.scrollIntoView({ inline: 'center', block: 'nearest' }))
    await page.screenshot({ path: join(out, `routes-${theme}-${width}.png`) })
    const note = page.getByRole('textbox', { name: 'Review note for changed', exact: true })
    for (let cycle = 0; cycle < 12; cycle++) {
      const draft = `${width}/${theme}/cycle-${cycle}`; let failing = true
      await page.route('**/api/review', route => failing ? (cycle % 2 ? route.abort('failed') : route.fulfill({ status: 503, body: 'Generated save outage' })) : route.continue())
      await note.fill(draft); await note.press('Tab'); await page.getByRole('button', { name: 'Retry unsaved changes', exact: true }).waitFor()
      check(`${width}/${theme}/${cycle}: failure retains draft and blocks export`, await note.inputValue() === draft && await page.getByRole('button', { name: 'Export review' }).isDisabled())
      if (!cycle) await page.screenshot({ path: join(out, `interrupted-save-${theme}-${width}.png`), fullPage: true })
      failing = false; await page.getByRole('button', { name: 'Retry unsaved changes', exact: true }).click(); await page.waitForFunction(() => document.querySelector('#save-status')?.textContent === 'All changes saved locally.')
      await page.unroute('**/api/review')
      const persisted = await (await fetch(base + '/api/run?compare=false')).json()
      check(`${width}/${theme}/${cycle}: retry persists exact draft`, persisted.review.tiles.changed.note === draft && !await page.getByRole('button', { name: 'Export review' }).isDisabled())
    }
    let release: (() => void) | undefined; const gate = new Promise<void>(resolve => { release = resolve })
    await page.route('**/api/review', async route => { await gate; await route.continue() })
    await note.fill('Earlier pending note'); const pending = page.waitForRequest('**/api/review'); await note.press('Tab'); await pending
    await note.fill('Newer note during pending save'); await note.press('Tab'); release!()
    await page.waitForFunction(() => document.querySelector('#save-status')?.textContent === 'All changes saved locally.')
    check(`${width}/${theme}: older response cannot overwrite newer queued note`, (await (await fetch(base + '/api/run?compare=false')).json()).review.tiles.changed.note === 'Newer note during pending save' && await note.inputValue() === 'Newer note during pending save')
    await page.unroute('**/api/review')
    await page.locator('.tile[data-id="changed"]').getByRole('button', { name: 'Inspect screenshot', exact: true }).click(); await page.locator('#viewer-mode').selectOption('baseline')
    await page.locator('#viewer-image').evaluate((img: HTMLImageElement) => img.decode())
    const expired = await page.locator('#viewer-image').getAttribute('src')
    for (let i = 0; i < 5; i++) await fetch(base + '/api/comparison')
    check(`${width}/${theme}: repeated snapshots expire old image`, (await fetch(base + expired)).status === 404)
    await page.locator('#viewer-mode').selectOption('current'); await page.locator('#viewer-image').evaluate((img: HTMLImageElement) => img.decode()); await page.locator('#viewer-mode').selectOption('baseline')
    await page.getByRole('button', { name: 'Refresh evidence', exact: true }).waitFor(); await page.getByRole('button', { name: 'Refresh evidence', exact: true }).click()
    await page.waitForFunction(() => { const img = document.querySelector<HTMLImageElement>('#viewer-image'); return img?.complete && img.naturalWidth && document.querySelector<HTMLElement>('#viewer-error')?.hidden })
    check(`${width}/${theme}: expired snapshot refresh recovers`, await page.locator('#viewer-image').getAttribute('src') !== expired)
    await page.keyboard.press('Escape'); await page.reload(); await page.waitForFunction(() => document.querySelector('#comparison-status')?.textContent?.startsWith('Comparison ready'))
    check(`${width}/${theme}: confirmed note survives reload`, await note.inputValue() === 'Newer note during pending save')
    check(`${width}/${theme}: no uncaught errors or document overflow`, errors.length === 0 && await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    await page.screenshot({ path: join(out, `recovered-${theme}-${width}.png`), fullPage: true }); await page.close()
  }
  const earlier = await (await fetch(base + '/api/comparison')).json()
  await new Promise(resolve => setTimeout(resolve, 16_000))
  const resumed = await (await fetch(base + '/api/comparison')).json()
  check('comparison worker resumes after idle cleanup', JSON.stringify(Object.values(earlier.tiles).map((t: any) => t.status)) === JSON.stringify(Object.values(resumed.tiles).map((t: any) => t.status)) && earlier.tiles.changed.baselineUrl !== resumed.tiles.changed.baselineUrl)
  writeJson(join(out, 'contrast.json'), { contrast, audits })
  writeJson(join(out, 'sessions.json'), { checks, elapsedMs: performance.now() - start, failureCycles: 48, scope: 'Four fresh desktop/mobile, light/dark pages; 12 alternating HTTP/network failures each, queued delayed saves and expiry/reload recovery. Synthetic image fixtures. Repeated-cycle stress, not a multi-hour soak or real screen-reader test.' })
  console.log(`${checks.length} contrast/session assertions passed`)
} finally { await browser.close(); server.stop() }
