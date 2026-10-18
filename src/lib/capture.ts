import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import AxeBuilder from '@axe-core/playwright'
import { type Browser, type BrowserContext, chromium } from 'playwright'
import { PNG } from 'pngjs'
import { findBlankBoxes } from './blank.ts'
import { fingerprint, validateManifest } from './manifest.ts'
import { routeSlug, tileFilename, tileId } from './names.ts'
import { fillParams } from './routes.ts'
import { setLatest, spineDir, writeJson } from './runs.ts'
import type {
  Box,
  CoverageEntry,
  Manifest,
  Provenance,
  RunRecord,
  StateDef,
  Tile,
} from './types.ts'

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
): { jobs: CaptureJob[]; skipped: string[]; coverage: CoverageEntry[] } {
  const jobs: CaptureJob[] = []
  const skipped: string[] = []
  const coverage: CoverageEntry[] = []
  for (const r of manifest.routes) {
    for (const st of r.states) {
      const path = fillParams(r.path, r.params)
      const filteredOut = !!onlyRoutes?.length && !onlyRoutes.includes(r.path)
      const unfilled = path.includes('[') || Object.values(r.params ?? {}).some((v) => v === 'TODO')
      const reason = filteredOut
        ? 'Outside selected routes'
        : st.exclude ||
          (st.todo ? st.setup || 'State unfinished' : unfilled ? 'Unfilled params' : undefined)
      const outcome = filteredOut
        ? 'filtered'
        : st.exclude
          ? 'excluded'
          : st.todo || unfilled
            ? 'skipped'
            : 'planned'
      if (outcome === 'skipped') skipped.push(`${r.path} / ${st.name}: ${reason}`)
      const withQuery = st.query ? `${path}${st.query.startsWith('?') ? '' : '?'}${st.query}` : path
      for (const viewport of manifest.viewports)
        for (const theme of ['light', 'dark'] as const) {
          coverage.push({
            id: tileId(r.path, st.name, viewport, theme),
            route: r.path,
            state: st.name,
            viewport,
            theme,
            outcome,
            reason,
            ...(outcome === 'excluded' ? { exclusionSource: 'manifest' as const } : {}),
          })
          if (outcome === 'planned')
            jobs.push({ route: r.path, path: withQuery, state: st, viewport, theme })
        }
    }
  }
  const files = new Map<string, CaptureJob>()
  for (const job of jobs) {
    const file = tileFilename(job.route, job.state.name, job.viewport, job.theme)
    // Case-insensitive filesystems treat About.png and about.png as one file.
    const key = file.toLowerCase()
    const other = files.get(key)
    if (other) {
      const hint =
        other.route === job.route
          ? 'Use distinct state names for colliding combinations.'
          : `Routes ${other.route} and ${job.route} share the slug ${routeSlug(job.route)}, so renaming states cannot fix it. Exclude one route (state "exclude") or capture them in separate runs with --routes.`
      throw new Error(
        `Multiple route/state combinations produce the same capture filename: ${file}. ${hint}`,
      )
    }
    files.set(key, job)
  }
  return { jobs, skipped, coverage }
}

export function captureProvenance(root: string, manifest: Manifest, browser: string): Provenance {
  let commit: string | null = null
  let dirty: boolean | null = null
  try {
    commit = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    dirty = !!execFileSync('git', ['status', '--porcelain'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {}
  return {
    commit,
    dirty,
    browser,
    runtime: process.versions.bun ? `Bun ${process.versions.bun}` : `Node ${process.versions.node}`,
    platform: `${process.platform}/${process.arch}`,
    manifestHash: fingerprint(manifest),
    policy: { animations: 'allow', ...manifest.capture },
  }
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

/** Runs inside the page at the initial viewport: large fixed/sticky layers (cookie banners, chat widgets, modals). */
function fixedOverlays(): string[] {
  const vw = window.innerWidth
  const vh = window.innerHeight
  // Name the overlay so a reader can find it: selector, role or label, and its opening text.
  const sel = (el: Element): string => {
    const cls =
      typeof el.className === 'string' ? el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''
    const role = el.getAttribute('role')
    const label = el.getAttribute('aria-label')
    const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40)
    return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${cls ? `.${cls}` : ''}${role ? `[role=${role}]` : ''}${label ? ` "${label}"` : text ? ` "${text}"` : ''}`
  }
  const hits: { el: Element; r: DOMRect; pct: number; position: string }[] = []
  for (const el of Array.from(document.body.querySelectorAll('*'))) {
    const cs = getComputedStyle(el)
    if (cs.position !== 'fixed' && cs.position !== 'sticky') continue
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue
    const r = el.getBoundingClientRect()
    // Headers: anchored at the top and slim.
    if (r.top <= 8 && r.height <= 120) continue
    const w = Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0))
    const h = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0))
    const pct = (w * h) / (vw * vh)
    if (pct >= 0.15) hits.push({ el, r, pct, position: cs.position })
  }
  hits.sort((a, b) => b.pct - a.pct)
  // Report outermost layers only; a fixed child of a reported layer is the same overlay.
  return hits
    .filter((h, i) => !hits.slice(0, i).some((o) => o.el.contains(h.el)))
    .slice(0, 3)
    .map(
      (h) =>
        `${h.position === 'sticky' ? 'Sticky' : 'Fixed'} overlay covers ${Math.round(h.pct * 100)}% of viewport: ${sel(h.el)}. Dismiss it with initScripts or a steps click.`,
    )
}

/** Wait before retrying a 429: Retry-After seconds (max 10), else 2s. */
export function retryDelayMs(retryAfter?: string): number {
  const seconds = retryAfter?.trim() ? Number(retryAfter) : Number.NaN
  return Number.isFinite(seconds) && seconds >= 0 ? Math.min(seconds, 10) * 1000 : 2000
}

async function scrollThrough(page: import('playwright').Page): Promise<void> {
  const vh = page.viewportSize()?.height ?? 800
  let height = await page.evaluate(() => document.documentElement.scrollHeight)
  let steps = 0
  for (let y = 0; y < height; y += Math.floor(vh * 0.8)) {
    if (++steps > 100 || height > 100000)
      throw new Error('Page exceeds bounded scroll capture limit')
    await page.evaluate((yy) => window.scrollTo(0, yy), y)
    await page.waitForTimeout(150)
    height = await page.evaluate(() => document.documentElement.scrollHeight)
  }
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(300)
}

/** Lazy assets may start loading only after scrolling; never wait indefinitely. */
export async function waitForCaptureAssets(
  page: import('playwright').Page,
  timeoutMs = 3000,
): Promise<boolean> {
  return page.evaluate(async (timeout) => {
    const assets = Promise.all([
      document.fonts.ready,
      ...Array.from(document.images, (image) => image.decode().catch(() => {})),
    ])
    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), timeout)
      void (async () => {
        await assets
        clearTimeout(timer)
        resolve(true)
      })()
    })
  }, timeoutMs)
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
    recipeHash: fingerprint({
      route: job.route,
      path: job.path,
      state: job.state,
      themes: manifest.themes,
      initScripts: manifest.initScripts ?? [],
      policy: manifest.capture ?? {},
    }),
    status: 0,
    consoleErrors: [],
    pageErrors: [],
    overflowX: false,
    blankRegions: { count: 0, boxes: [] },
    brokenImages: [],
    textClipped: [],
  }
  let ctx: BrowserContext | undefined
  let stage = 'context initialization'
  try {
    ctx = await browser.newContext({
      viewport: { width: job.viewport, height: job.viewport < 600 ? 844 : 900 },
      deviceScaleFactor: 1,
      reducedMotion: 'reduce',
      colorScheme: job.theme,
      storageState: job.state.storageState ? join(cwd, job.state.storageState) : undefined,
    })
    stage = 'navigation'
    await applyThemeAndInit(ctx, manifest, job.theme)
    const page = await ctx.newPage()
    page.setDefaultTimeout(manifest.capture?.timeoutMs ?? 5000)
    if (manifest.capture?.clock) await page.clock.setFixedTime(new Date(manifest.capture.clock))
    for (const response of job.state.responses ?? []) {
      await page.route(response.url, (route) =>
        route.fulfill({
          status: response.status,
          body: response.body ?? '',
          contentType: response.contentType ?? 'text/plain',
        }),
      )
    }
    page.on('console', (m) => {
      if (m.type() === 'error' && tile.consoleErrors.length < 20)
        tile.consoleErrors.push(m.text().slice(0, 200))
    })
    page.on('pageerror', (e) => {
      if (tile.pageErrors.length < 20) tile.pageErrors.push(e.message.slice(0, 200))
    })
    // `load` first, then a bounded wait for network idle. Pages that poll (live
    // embeds) never go idle; waiting on networkidle alone timed out and lost the tile.
    const url = manifest.baseUrl.replace(/\/$/, '') + job.path
    const go = (): Promise<import('playwright').Response | null> =>
      page.goto(url, { waitUntil: 'load', timeout: 30000 })
    let resp = await go()
    if (resp?.status() === 429) {
      await page.waitForTimeout(retryDelayMs(resp.headers()['retry-after']))
      resp = await go()
    }
    tile.status = resp?.status() ?? 0
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {
      tile.warnings = [...(tile.warnings ?? []), 'network never went idle; captured after load']
    })
    const finalPath = new URL(page.url()).pathname
    if (finalPath.replace(/\/$/, '') !== (job.path.split('?')[0] ?? '').replace(/\/$/, '')) {
      tile.redirectedTo = finalPath
    }
    stage = 'state recipe'
    for (const step of job.state.steps ?? []) {
      const locator = page.locator(step.selector)
      const options = { timeout: step.timeoutMs ?? manifest.capture?.timeoutMs ?? 5000 }
      if (step.action === 'click') await locator.click(options)
      else if (step.action === 'hover') await locator.hover(options)
      else if (step.action === 'fill') await locator.fill(step.value, options)
      else if (step.action === 'press') await locator.press(step.key, options)
      else await locator.waitFor({ ...options, state: 'visible' })
    }
    stage = 'readiness'
    if (job.state.ready)
      await page.locator(job.state.ready.selector).waitFor({
        state: 'visible',
        timeout: job.state.ready.timeoutMs ?? manifest.capture?.timeoutMs ?? 5000,
      })
    await page.waitForTimeout(400)
    const overlays = await page.evaluate(fixedOverlays)
    if (overlays.length) tile.warnings = [...(tile.warnings ?? []), ...overlays]
    await scrollThrough(page)
    if (!(await waitForCaptureAssets(page))) {
      tile.warnings = [
        ...(tile.warnings ?? []),
        'fonts or images did not settle within 3 seconds; captured available content',
      ]
    }
    stage = 'screenshot'
    const screenshot = (): Promise<Buffer> =>
      page.screenshot({
        fullPage: true,
        animations: manifest.capture?.animations ?? 'allow',
        timeout: 10000,
      })
    let buf = await screenshot()
    if (manifest.capture?.stabilityAttempts) {
      tile.stability = 'unstable'
      for (let attempt = 1; attempt < manifest.capture.stabilityAttempts; attempt++) {
        await page.waitForTimeout(150)
        const next = await screenshot()
        if (next.equals(buf)) {
          tile.stability = 'stable'
          buf = next
          break
        }
        buf = next
      }
      if (tile.stability === 'unstable')
        tile.warnings = [
          ...(tile.warnings ?? []),
          'Screenshot did not stabilize within the configured attempt budget',
        ]
    }
    writeFileSync(join(outDir, file), buf)
    tile.imageHash = createHash('sha256').update(buf).digest('hex')
    tile.masks = []
    for (const mask of job.state.masks ?? []) {
      const boxes = await page.locator(mask.selector).evaluateAll((elements) =>
        elements
          .map((el) => {
            const r = el.getBoundingClientRect()
            return {
              x: r.left + window.scrollX,
              y: r.top + window.scrollY,
              w: r.width,
              h: r.height,
            }
          })
          .filter((box) => box.w > 0 && box.h > 0),
      )
      if (!boxes.length) throw new Error('Configured mask did not match a visible element')
      tile.masks.push({ ...mask, boxes })
    }
    const m = await page.evaluate(pageMetrics)
    if (manifest.capture?.accessibility) {
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        const result = await Promise.race([
          new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze(),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error('Accessibility scan timed out')), 15000)
          }),
        ])
        tile.accessibility = {
          engine: `axe ${result.testEngine.version}`,
          violations: result.violations.slice(0, 100).map((issue) => ({
            id: issue.id,
            impact: issue.impact ?? null,
            help: issue.help,
            targets: issue.nodes.slice(0, 20).map((node) => node.target.join(' ')),
          })),
        }
      } catch {
        tile.accessibility = {
          engine: 'axe',
          violations: [],
          error: 'Accessibility scan unavailable; retry this capture.',
        }
      } finally {
        clearTimeout(timer)
      }
    }
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
    tile.diagnostic = {
      stage,
      message: `Capture failed during ${stage}. Inspect the configured condition and retry.`,
    }
  } finally {
    await ctx?.close().catch(() => {})
  }
  return tile
}

export interface CaptureOptions {
  root: string
  manifest: Manifest
  baseUrl: string
  /** Written to run.json instead of baseUrl when the capture reaches the app by another name. */
  recordedBaseUrl?: string
  routes?: string[]
  concurrency: number
  log?: (s: string) => void
}

export async function runCapture(
  opts: CaptureOptions,
): Promise<{ run: RunRecord; dir: string; skipped: string[] }> {
  const manifest = validateManifest({ ...opts.manifest, baseUrl: opts.baseUrl }, opts.root)
  const { jobs, skipped, coverage } = planJobs(manifest, opts.routes)
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
    schemaVersion: 2,
    id,
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    baseUrl: opts.recordedBaseUrl ?? manifest.baseUrl,
    tiles,
    coverage: coverage.map((entry) => {
      if (entry.outcome !== 'planned') return entry
      const tile = tiles.find((t) => t.id === entry.id)
      return { ...entry, outcome: tile && !tile.error ? 'captured' : 'failed', reason: tile?.error }
    }),
    provenance: captureProvenance(opts.root, manifest, browser.version()),
  }
  writeJson(join(dir, 'run.json'), run)
  setLatest(opts.root, id)
  return { run, dir, skipped }
}

export function loadManifest(path: string): Manifest {
  if (!existsSync(path)) throw new Error(`Manifest ${path} not found. Run \`spine plan\` first.`)
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'))
  } catch (e) {
    throw new Error(`Manifest ${path} is not valid JSON: ${(e as Error).message}`)
  }
  return validateManifest(raw)
}
