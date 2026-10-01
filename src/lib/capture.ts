import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { type Browser, type BrowserContext, chromium } from 'playwright'
import { PNG } from 'pngjs'
import { findBlankBoxes } from './blank.ts'
import { tileFilename, tileId } from './names.ts'
import { fillParams } from './routes.ts'
import { setLatest, spineDir, writeJson } from './runs.ts'
import type { Box, Manifest, RunRecord, StateDef, Tile } from './types.ts'

export interface CaptureJob {
  route: string
  path: string
  state: StateDef
  viewport: number
  theme: 'light' | 'dark'
}

export function planJobs(
  manifest: Manifest,
  onlyRoutes?: string[],
): { jobs: CaptureJob[]; skipped: string[] } {
  const jobs: CaptureJob[] = []
  const skipped: string[] = []
  for (const r of manifest.routes) {
    if (onlyRoutes?.length && !onlyRoutes.includes(r.path)) continue
    for (const st of r.states) {
      if (st.todo) continue
      const path = fillParams(r.path, r.params)
      if (path.includes('[')) {
        skipped.push(`${r.path} (unfilled params)`)
        continue
      }
      const withQuery = st.query ? `${path}${st.query.startsWith('?') ? '' : '?'}${st.query}` : path
      for (const viewport of manifest.viewports)
        for (const theme of ['light', 'dark'] as const)
          jobs.push({ route: r.path, path: withQuery, state: st, viewport, theme })
    }
  }
  return { jobs, skipped }
}

async function applyThemeAndInit(
  ctx: BrowserContext,
  manifest: Manifest,
  theme: 'light' | 'dark',
): Promise<void> {
  for (const s of manifest.initScripts ?? []) {
    await ctx.addInitScript((kv: Record<string, string>) => {
      try {
        for (const [k, v] of Object.entries(kv)) localStorage.setItem(k as string, v as string)
      } catch {}
    }, s.localStorage)
  }
  const t = manifest.themes
  const value = theme === 'dark' ? t.dark : t.light
  if (t.method === 'localStorage') {
    await ctx.addInitScript(
      ([k, v]: string[]) => {
        try {
          localStorage.setItem(k as string, v as string)
        } catch {}
      },
      [t.key ?? 'theme', value],
    )
  } else if (t.method === 'class') {
    await ctx.addInitScript(
      ([on, off]: string[]) => {
        const apply = (): void => {
          const el = document.documentElement
          if (!el) return
          if (off) el.classList.remove(off)
          if (on) el.classList.add(on)
        }
        apply()
        document.addEventListener('DOMContentLoaded', apply)
      },
      theme === 'dark' ? [t.dark, t.light] : [t.light, t.dark],
    )
  }
}

// Runs inside the page. Kept as a string-free function so Playwright serializes it.
function pageMetrics(): {
  overflowX: boolean
  candidates: Box[]
  brokenImages: string[]
  textClipped: { selector: string; text: string }[]
} {
  const de = document.documentElement
  const sx = window.scrollX
  const sy = window.scrollY
  const sel = (el: Element): string => {
    const cls =
      typeof el.className === 'string' ? el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''
    return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${cls ? `.${cls}` : ''}`
  }
  const CONTENT = 'img,svg,video,canvas,picture,iframe,input,textarea,select,button,object,embed'
  const candidates: Box[] = []
  const clipped: { selector: string; text: string }[] = []
  for (const el of Array.from(document.body.querySelectorAll('*'))) {
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue
    if (cs.position === 'fixed') continue
    const r = el.getBoundingClientRect()
    const text = (el.textContent ?? '').trim()
    if (
      r.width >= 120 &&
      r.height >= 80 &&
      !text &&
      !el.matches(CONTENT) &&
      !el.querySelector(CONTENT)
    ) {
      candidates.push({ x: r.left + sx, y: r.top + sy, w: r.width, h: r.height })
    }
    const hidden = cs.overflowX === 'hidden' || cs.overflow === 'hidden'
    // Intentional clipping is not a defect: screen-reader-only text (1px box or a
    // zero clip rect), `truncate`/line-clamp, and text-overflow: ellipsis. On the
    // first real run (testimoniq) these were every single textClipped hit.
    const intentional =
      r.width <= 1 ||
      r.height <= 1 ||
      cs.clip === 'rect(0px, 0px, 0px, 0px)' ||
      cs.textOverflow === 'ellipsis' ||
      el.matches('.sr-only, .truncate, [class*="line-clamp"]')
    // A few px of glyph overhang (display fonts) is not clipped content.
    if (hidden && !intentional && el.scrollWidth > el.clientWidth + 4 && text && r.width > 0) {
      clipped.push({ selector: sel(el), text: text.slice(0, 60) })
    }
  }
  // Keep outermost candidates only.
  const outer = candidates.filter(
    (a, i) =>
      !candidates.some(
        (b, j) =>
          j !== i &&
          b.x <= a.x &&
          b.y <= a.y &&
          b.x + b.w >= a.x + a.w &&
          b.y + b.h >= a.y + a.h &&
          (b.w > a.w || b.h > a.h),
      ),
  )
  const broken = Array.from(document.images)
    .filter((i) => i.complete && i.naturalWidth === 0 && (i.currentSrc || i.getAttribute('src')))
    .map((i) => (i.currentSrc || i.getAttribute('src') || '').slice(0, 160))
  return {
    overflowX: de.scrollWidth > de.clientWidth,
    candidates: outer,
    brokenImages: broken,
    textClipped: clipped.slice(0, 10),
  }
}

async function scrollThrough(page: import('playwright').Page): Promise<void> {
  const vh = page.viewportSize()?.height ?? 800
  let height = await page.evaluate(() => document.documentElement.scrollHeight)
  for (let y = 0; y < height; y += Math.floor(vh * 0.8)) {
    await page.evaluate((yy) => window.scrollTo(0, yy), y)
    await page.waitForTimeout(150)
    height = await page.evaluate(() => document.documentElement.scrollHeight)
  }
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(300)
}

async function captureTile(
  browser: Browser,
  manifest: Manifest,
  job: CaptureJob,
  outDir: string,
  cwd: string,
): Promise<Tile> {
  const file = tileFilename(job.route, job.state.name, job.viewport, job.theme)
  const tile: Tile = {
    id: tileId(job.route, job.state.name, job.viewport, job.theme),
    file,
    route: job.route,
    path: job.path,
    state: job.state.name,
    viewport: job.viewport,
    theme: job.theme,
    status: 0,
    consoleErrors: [],
    pageErrors: [],
    overflowX: false,
    blankRegions: { count: 0, boxes: [] },
    brokenImages: [],
    textClipped: [],
  }
  const ctx = await browser.newContext({
    viewport: { width: job.viewport, height: job.viewport < 600 ? 844 : 900 },
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
    colorScheme: job.theme,
    storageState: job.state.storageState ? join(cwd, job.state.storageState) : undefined,
  })
  try {
    await applyThemeAndInit(ctx, manifest, job.theme)
    const page = await ctx.newPage()
    page.on('console', (m) => {
      if (m.type() === 'error') tile.consoleErrors.push(m.text().slice(0, 200))
    })
    page.on('pageerror', (e) => tile.pageErrors.push(e.message.slice(0, 200)))
    // `load` first, then a bounded wait for network idle. Pages that poll (live
    // embeds) never go idle; waiting on networkidle alone timed out and lost the tile.
    const resp = await page.goto(manifest.baseUrl.replace(/\/$/, '') + job.path, {
      waitUntil: 'load',
      timeout: 30000,
    })
    tile.status = resp?.status() ?? 0
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {
      tile.warnings = [...(tile.warnings ?? []), 'network never went idle; captured after load']
    })
    const finalPath = new URL(page.url()).pathname
    if (finalPath.replace(/\/$/, '') !== job.path.split('?')[0]!.replace(/\/$/, '')) {
      tile.redirectedTo = finalPath
    }
    await page.waitForTimeout(400)
    await scrollThrough(page)
    const m = await page.evaluate(pageMetrics)
    const buf = await page.screenshot({ path: join(outDir, file), fullPage: true })
    tile.overflowX = m.overflowX
    tile.brokenImages = m.brokenImages
    tile.textClipped = m.textClipped
    const boxes = findBlankBoxes(PNG.sync.read(buf), m.candidates).map((b) => ({
      x: Math.round(b.x),
      y: Math.round(b.y),
      w: Math.round(b.w),
      h: Math.round(b.h),
    }))
    tile.blankRegions = { count: boxes.length, boxes }
    tile.consoleErrors = [...new Set(tile.consoleErrors)].slice(0, 5)
    tile.pageErrors = [...new Set(tile.pageErrors)].slice(0, 5)
  } catch (e) {
    tile.error = (e as Error).message.split('\n')[0]?.slice(0, 200)
  } finally {
    await ctx.close()
  }
  return tile
}

export interface CaptureOptions {
  root: string
  manifest: Manifest
  baseUrl: string
  routes?: string[]
  concurrency: number
  log?: (s: string) => void
}

export async function runCapture(
  opts: CaptureOptions,
): Promise<{ run: RunRecord; dir: string; skipped: string[] }> {
  const manifest = { ...opts.manifest, baseUrl: opts.baseUrl }
  const { jobs, skipped } = planJobs(manifest, opts.routes)
  if (!jobs.length)
    throw new Error('No capturable tiles (all states are todo, or routes filter matched nothing).')
  const startedAt = new Date()
  const id = startedAt.toISOString().replace(/[:.]/g, '-')
  const dir = join(spineDir(opts.root), 'runs', id)
  mkdirSync(dir, { recursive: true })
  const browser = await chromium.launch()
  const tiles: Tile[] = new Array(jobs.length)
  let next = 0
  let done = 0
  const worker = async (): Promise<void> => {
    while (next < jobs.length) {
      const i = next++
      const tile = await captureTile(browser, manifest, jobs[i] as CaptureJob, dir, opts.root)
      tiles[i] = tile
      opts.log?.(
        `[${++done}/${jobs.length}] ${tile.id} status=${tile.status}${tile.error ? ` ERROR ${tile.error}` : ''}`,
      )
    }
  }
  try {
    await Promise.all(Array.from({ length: Math.max(1, opts.concurrency) }, worker))
  } finally {
    await browser.close()
  }
  const run: RunRecord = {
    id,
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    baseUrl: manifest.baseUrl,
    tiles,
  }
  writeJson(join(dir, 'run.json'), run)
  setLatest(opts.root, id)
  return { run, dir, skipped }
}

export function loadManifest(path: string): Manifest {
  return JSON.parse(readFileSync(path, 'utf8')) as Manifest
}
