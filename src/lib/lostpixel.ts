import { validateManifest } from './manifest.ts'
import type { Manifest, RouteDef, StateDef } from './types.ts'

/** The pageShots part of a Lost Pixel config (lost-pixel 3.x, `PageScreenshotParameter`). */
export interface LostPixelPage {
  path: string
  name: string
  waitBeforeScreenshot?: number
  threshold?: number
  breakpoints?: number[]
  viewport?: { width?: number; height?: number }
  mask?: { selector: string }[]
}
export interface LostPixelConfig {
  breakpoints?: number[]
  pageShots?: {
    pages?: LostPixelPage[]
    pagesJsonUrl?: string
    baseUrl?: string
    mask?: { selector: string }[]
    breakpoints?: number[]
  }
}

const isPage = (p: unknown): p is LostPixelPage =>
  !!p &&
  typeof p === 'object' &&
  typeof (p as LostPixelPage).path === 'string' &&
  typeof (p as LostPixelPage).name === 'string'

/**
 * Turn Lost Pixel page shots into a Design Spine manifest. Pages sharing a path become states of
 * one route; a query string moves into the state's `query`. Lost Pixel options with no exact
 * equivalent are listed in `notes` rather than guessed.
 */
export function convertLostPixel(
  config: LostPixelConfig,
  extraPages: unknown[] = [],
): { manifest: Manifest; notes: string[] } {
  const shots = config.pageShots
  if (!shots)
    throw new Error('No pageShots in the Lost Pixel config; only page shots can be imported.')
  const notes: string[] = []
  const pages = [...(shots.pages ?? []), ...extraPages].filter((p, index) => {
    if (isPage(p)) return true
    notes.push(`Skipped page entry ${index}: it needs a string path and name.`)
    return false
  }) as LostPixelPage[]
  if (!pages.length) throw new Error('The Lost Pixel config has no pages to import.')
  if (shots.pagesJsonUrl && !extraPages.length)
    notes.push(
      `pagesJsonUrl ${shots.pagesJsonUrl} was not fetched. Save its JSON to a file and pass --pages <file> to include those pages.`,
    )
  const widths = new Set<number>()
  const add = (list?: number[]) => {
    for (const w of list ?? []) if (Number.isInteger(w) && w > 0) widths.add(w)
  }
  add(config.breakpoints)
  add(shots.breakpoints)
  const globalMasks = shots.mask ?? []
  const byPath = new Map<string, { page: LostPixelPage; query: string }[]>()
  for (const page of pages) {
    add(page.breakpoints)
    if (page.viewport?.width) add([page.viewport.width])
    if (page.breakpoints?.length || page.viewport?.width)
      notes.push(
        `${page.name}: its own breakpoints or viewport width were added to the shared viewports; every route is captured at every width.`,
      )
    if (page.threshold)
      notes.push(
        `${page.name}: per-page threshold ${page.threshold} has no per-route equivalent; diff uses one --threshold.`,
      )
    if (page.waitBeforeScreenshot && page.waitBeforeScreenshot !== 1000)
      notes.push(
        `${page.name}: waitBeforeScreenshot ${page.waitBeforeScreenshot} ms is not copied; set a ready selector for what the page waits on.`,
      )
    const raw = page.path.startsWith('/') ? page.path : `/${page.path}`
    const [path = '/', query = ''] = raw.split(/(?=[?#])/)
    if (query.startsWith('#')) notes.push(`${page.name}: dropped the #fragment from ${raw}.`)
    byPath.set(path, [
      ...(byPath.get(path) ?? []),
      { page, query: query.startsWith('?') ? query : '' },
    ])
  }
  const routes: RouteDef[] = [...byPath.entries()].map(([path, entries]) => {
    const used = new Map<string, number>()
    const unique = (name: string): string => {
      const n = (used.get(name) ?? 0) + 1
      used.set(name, n)
      return n === 1 ? name : `${name}-${n}`
    }
    return {
      path,
      states: entries.map(({ page, query }): StateDef => {
        const masks = [...globalMasks, ...(page.mask ?? [])].map((m) => ({
          selector: m.selector,
          reason: 'Imported from Lost Pixel mask',
        }))
        return {
          // One shot per path keeps the usual state name; several become states named after them.
          name: entries.length === 1 ? 'ideal' : unique(page.name),
          ...(query ? { query } : {}),
          ...(masks.length ? { masks } : {}),
        }
      }),
    }
  })
  let baseUrl = shots.baseUrl ?? 'http://localhost:3000'
  // Lost Pixel's docs point CI at the Docker bridge; Design Spine reaches the host itself.
  if (/^https?:\/\/172\.17\.0\.1\b/.test(baseUrl)) {
    notes.push(
      `baseUrl ${baseUrl} is the Docker bridge address Lost Pixel uses; changed to localhost.`,
    )
    baseUrl = baseUrl.replace('172.17.0.1', 'localhost')
  }
  const manifest = validateManifest({
    baseUrl,
    viewports: widths.size ? [...widths].sort((a, b) => a - b) : [390, 1280],
    themes: { light: 'light', dark: 'dark', method: 'media' },
    capture: { animations: 'disabled', stabilityAttempts: 3 },
    routes,
  })
  if (!widths.size) notes.push('No breakpoints in the config; using 390 and 1280.')
  notes.push(
    'Themes use the prefers-color-scheme media query. If the app switches themes with a class or localStorage, set themes.method and key.',
  )
  return { manifest, notes }
}
