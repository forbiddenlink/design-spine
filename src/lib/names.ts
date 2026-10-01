import type { Tile } from './types.ts'

const clean = (s: string): string =>
  s
    .replace(/[^a-zA-Z0-9[\]._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

export function routeSlug(path: string): string {
  const p = path.split('?')[0] ?? ''
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
