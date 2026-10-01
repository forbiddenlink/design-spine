import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { Manifest, RouteDef, StateDef } from './types.ts'

export interface ScannedRoutes {
  static: string[]
  dynamic: string[]
}

const PAGE_RE = /^page\.(tsx|jsx|ts|js|mdx)$/

export function findAppDir(root: string, explicit?: string): string | null {
  if (explicit) return existsSync(explicit) ? explicit : null
  for (const c of ['app', 'src/app']) {
    const p = join(root, c)
    if (existsSync(p) && statSync(p).isDirectory()) return p
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
  const walk = (dir: string, segs: string[]): void => {
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      return
    }
    if (entries.some((e) => PAGE_RE.test(e) && statSync(join(dir, e)).isFile())) {
      found.add(`/${segs.join('/')}`)
    }
    for (const e of entries.sort()) {
      const full = join(dir, e)
      if (e === 'node_modules' || !statSync(full).isDirectory()) continue
      const seg = segmentToUrl(e)
      if (seg === 'skip') continue
      walk(full, seg === null ? segs : [...segs, seg])
    }
  }
  walk(appDir, [])
  const all = [...found].sort()
  const isDyn = (p: string): boolean => /\[/.test(p)
  return { static: all.filter((p) => !isDyn(p)), dynamic: all.filter(isDyn) }
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

// Scott Hurff's UI Stack: ideal, empty, error, partial, loading.
export function defaultStates(ideal: Partial<StateDef> = {}): StateDef[] {
  return [
    { name: 'ideal', ...ideal },
    { name: 'empty', todo: true, setup: 'Seed or storageState with no data for this screen' },
    {
      name: 'loading',
      todo: true,
      setup: 'Throttle or stall the data request so the skeleton shows',
    },
    { name: 'error', todo: true, setup: 'Force the data request to fail so the error UI shows' },
  ]
}

export function draftManifest(scanned: ScannedRoutes, baseUrl = 'http://localhost:3000'): Manifest {
  const routes: RouteDef[] = [
    ...scanned.static.map((path) => ({ path, states: defaultStates() })),
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
    initScripts: [],
    routes,
  }
}
