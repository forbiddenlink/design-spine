import type { Box } from './types.ts'

/** What the signature needs from one compared tile. Sizes and regions are in image pixels. */
export interface CauseInput {
  id: string
  viewport: number
  theme: string
  width: number
  height: number
  /** Changed pixels over total pixels. */
  ratio: number
  regions: Box[]
}

export interface CauseGroup {
  signature: string
  /** Members in the order they were given. Always at least two. */
  tileIds: string[]
  /** Vertical extent of the shared change in image pixels, snapped to bands. */
  yRange: [number, number]
  position: 'top' | 'middle' | 'bottom'
  label: string
}

const BAND = 40
const COLUMNS = 10

/**
 * Heuristic for "same cause": one change (a dependency bump, a header tweak) paints the same area
 * of every page it touches. The signature is the viewport width, the theme, the union box of the
 * changed regions (x snapped to tenths of the tile width, y rounded to the nearest 40px) and a coarse
 * changed-pixel bucket. The route and state are left out on purpose, so /pricing and /about group
 * when the same header moved. It is loose on exact position and strict on shape; tiles whose
 * content was pushed down by different amounts will not group. Returns null when nothing changed.
 */
export function changeSignature(input: CauseInput): string | null {
  const { regions, width, height } = input
  if (!regions.length || width <= 0 || height <= 0) return null
  const x0 = Math.min(...regions.map((r) => r.x))
  const x1 = Math.max(...regions.map((r) => r.x + r.w))
  const y0 = Math.min(...regions.map((r) => r.y))
  const y1 = Math.max(...regions.map((r) => r.y + r.h))
  const col0 = Math.floor((x0 / width) * COLUMNS)
  const col1 = Math.ceil((x1 / width) * COLUMNS)
  const band0 = Math.round(y0 / BAND) * BAND
  const band1 = Math.round(y1 / BAND) * BAND
  const bucket =
    input.ratio < 0.005 ? 'xs' : input.ratio < 0.02 ? 's' : input.ratio < 0.1 ? 'm' : 'l'
  return `${input.viewport}|${input.theme}|x${col0}-${col1}|y${band0}-${band1}|${bucket}`
}

/** Group tiles with equal signatures. Groups of one are dropped; biggest groups come first. */
export function groupByCause(inputs: CauseInput[]): CauseGroup[] {
  const bySignature = new Map<string, CauseInput[]>()
  for (const input of inputs) {
    const signature = changeSignature(input)
    if (!signature) continue
    const members = bySignature.get(signature)
    if (members) members.push(input)
    else bySignature.set(signature, [input])
  }
  const groups: CauseGroup[] = []
  for (const [signature, members] of bySignature) {
    const first = members[0]
    if (!first || members.length < 2) continue
    const match = signature.match(/\|y(\d+)-(\d+)\|/)
    const yRange: [number, number] = [Number(match?.[1]), Number(match?.[2])]
    const centre = (yRange[0] + yRange[1]) / 2 / first.height
    const position = centre < 0.25 ? 'top' : centre > 0.75 ? 'bottom' : 'middle'
    groups.push({
      signature,
      tileIds: members.map((m) => m.id),
      yRange,
      position,
      label: `${members.length} tiles, same change near ${position} ${yRange[0]}-${yRange[1]}px`,
    })
  }
  return groups.sort((a, b) => b.tileIds.length - a.tileIds.length)
}
