import type { Tile } from './types.ts'

const clean = (s: string): string =>
  s
    .replace(/[^a-zA-Z0-9[\]._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

// Non-ASCII characters would be stripped and collapse distinct routes onto one slug.
const asciiSafe = (s: string): string =>
  Array.from(s, (ch) => {
    const cp = ch.codePointAt(0) as number
    return cp > 0x7f ? `u${cp.toString(16)}` : ch
  }).join('')

export function routeSlug(path: string): string {
  const p = asciiSafe(path.split('?')[0] ?? '')
  const slug = clean(p.replace(/^\/+|\/+$/g, '').replace(/\//g, '-'))
  return slug || 'home'
}

export function tileId(route: string, state: string, viewport: number, theme: string): string {
  return `${routeSlug(route)}__${clean(state) || 'ideal'}__${viewport}__${theme}`
}

export function tileFilename(
  route: string,
  state: string,
  viewport: number,
  theme: string,
): string {
  return `${tileId(route, state, viewport, theme)}.png`
}

export function runIdFromDate(d: Date): string {
  return d.toISOString().replace(/[:.]/g, '-')
}

export const idFromFile = (file: string): string => file.replace(/\.png$/, '')

export const tileLabel = (t: Pick<Tile, 'viewport' | 'theme'>): string => `${t.viewport} ${t.theme}`
