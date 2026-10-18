import { lstatSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { routeSlug } from './names.ts'
import type { Manifest, RouteDef, StateDef } from './types.ts'

export interface ScannedRoutes {
  static: string[]
  dynamic: string[]
  /** Per-route special files: a `loading.*` / `error.*` next to the page. */
  special?: Record<string, { loading: boolean; error: boolean }>
}

const PAGE_RE = /^page\.(tsx|jsx|ts|js|mdx)$/
const LOADING_RE = /^loading\.(tsx|jsx|js)$/
const ERROR_RE = /^error\.(tsx|jsx|js)$/

/** statSync that never throws: dangling symlinks and unreadable entries read as null. */
function safeStat(path: string): ReturnType<typeof statSync> | null {
  try {
    return statSync(path)
  } catch {
    return null
  }
}
const isDir = (path: string): boolean => !!safeStat(path)?.isDirectory()
/** A real directory only: a symlinked one can point back into the tree and loop forever. */
const isRealDir = (path: string): boolean => {
  try {
    return lstatSync(path).isDirectory()
  } catch {
    return false
  }
}
const isFile = (path: string): boolean => !!safeStat(path)?.isFile()

/** True when there is no app router but a pages/ router that Design Spine cannot read yet. */
export function hasPagesRouter(root: string): boolean {
  return !findAppDir(root) && ['pages', 'src/pages'].some((c) => isDir(join(root, c)))
}

export function findAppDir(root: string, explicit?: string): string | null {
  if (explicit) return isDir(explicit) ? explicit : null
  for (const c of ['app', 'src/app']) {
    const p = join(root, c)
    if (isDir(p)) return p
  }
  return null
}

/** Convert one directory segment to a URL segment, or null to drop it. 'skip' drops the whole route. */
function segmentToUrl(seg: string): string | null | 'skip' {
  if (/^\(\..*\)/.test(seg)) return 'skip' // intercepting routes
  if (/^\(.*\)$/.test(seg)) return null // route group
  if (seg.startsWith('@')) return 'skip' // parallel slot
  if (seg.startsWith('_')) return 'skip' // private folder
  return seg
}

export function scanRoutes(appDir: string): ScannedRoutes {
  const found = new Set<string>()
  const special: Record<string, { loading: boolean; error: boolean }> = {}
  const walk = (dir: string, segs: string[]): void => {
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      return
    }
    if (entries.some((e) => PAGE_RE.test(e) && isFile(join(dir, e)))) {
      const flags = {
        loading: entries.some((e) => LOADING_RE.test(e) && isFile(join(dir, e))),
        error: entries.some((e) => ERROR_RE.test(e) && isFile(join(dir, e))),
      }
      const route = `/${segs.join('/')}`
      found.add(route)
      special[route] = flags
      // `[[...slug]]` also serves its bare base path.
      if (/^\[\[\.\.\..+\]\]$/.test(segs[segs.length - 1] ?? '')) {
        const base = `/${segs.slice(0, -1).join('/')}`
        found.add(base)
        special[base] ??= flags
      }
    }
    for (const e of entries.sort()) {
      const full = join(dir, e)
      if (e === 'node_modules' || !isRealDir(full)) continue
      const seg = segmentToUrl(e)
      if (seg === 'skip') continue
      walk(full, seg === null ? segs : [...segs, seg])
    }
  }
  walk(appDir, [])
  const all = [...found].sort()
  const isDyn = (p: string): boolean => /\[/.test(p)
  return { static: all.filter((p) => !isDyn(p)), dynamic: all.filter(isDyn), special }
}

/** Routes validateManifest rejects: a `#`, `?` or backslash cannot be a local route path. */
export const isManifestSafeRoute = (path: string): boolean => !/[?#\\]/.test(path)

/** Groups of routes whose tile filenames would collide (`/a-b` and `/a/b` both slug to `a-b`). */
export function slugCollisions(paths: string[]): string[][] {
  const bySlug = new Map<string, string[]>()
  // Lowercased: /About and /about share one file on case-insensitive filesystems.
  for (const p of paths) {
    const key = routeSlug(p).toLowerCase()
    bySlug.set(key, [...(bySlug.get(key) ?? []), p])
  }
  return [...bySlug.values()].filter((g) => g.length > 1)
}

export function paramNames(path: string): string[] {
  return [...path.matchAll(/\[\[?(?:\.\.\.)?([^\]]+)\]\]?/g)].map((m) => m[1] as string)
}

export function fillParams(path: string, params: Record<string, string> = {}): string {
  return path.replace(
    /\[\[?(?:\.\.\.)?([^\]]+)\]\]?/g,
    (_m, name: string) => params[name] ?? `[${name}]`,
  )
}

const EMPTY: StateDef = {
  name: 'empty',
  todo: true,
  setup: 'Seed or storageState with no data for this screen',
}
const LOADING: StateDef = {
  name: 'loading',
  todo: true,
  setup: 'Throttle or stall the data request so the skeleton shows',
}
const ERROR: StateDef = {
  name: 'error',
  todo: true,
  setup: 'Force the data request to fail so the error UI shows',
}

// Scott Hurff's UI Stack: ideal, empty, error, partial, loading.
export function defaultStates(ideal: Partial<StateDef> = {}): StateDef[] {
  return [{ name: 'ideal', ...ideal }, { ...EMPTY }, { ...LOADING }, { ...ERROR }]
}

/** Static routes get `ideal`, plus loading/error only when the segment has a loading/error file. */
function staticStates(flags?: { loading: boolean; error: boolean }): StateDef[] {
  return [
    { name: 'ideal' },
    ...(flags?.loading ? [{ ...LOADING }] : []),
    ...(flags?.error ? [{ ...ERROR }] : []),
  ]
}

export function draftManifest(
  scanned: ScannedRoutes,
  baseUrl = 'http://localhost:3000',
  allStates = false,
): Manifest {
  const routes: RouteDef[] = [
    ...scanned.static.map((path) => ({
      path,
      states: allStates ? defaultStates() : staticStates(scanned.special?.[path]),
    })),
    ...scanned.dynamic.map((path) => ({
      path,
      params: Object.fromEntries(paramNames(path).map((n) => [n, 'TODO'])),
      states: defaultStates({ todo: true, setup: 'Fill params with a real slug, then drop todo' }),
    })),
  ]
  return {
    baseUrl,
    viewports: [390, 1280],
    themes: { light: 'light', dark: 'dark', method: 'localStorage', key: 'theme' },
    // Motion and unsettled pages are the main source of false diffs; start stable.
    capture: { animations: 'disabled', stabilityAttempts: 3 },
    initScripts: [],
    routes,
  }
}
