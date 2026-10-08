import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { PNG } from 'pngjs'
import { compareImages } from './diff.ts'
import { readJson } from './runs.ts'
import type { RunRecord } from './types.ts'

export interface ComparisonEntry {
  status: 'new' | 'changed' | 'unchanged' | 'size-changed' | 'no-capture' | 'unavailable'
  ratio?: number
  baselineUrl?: string
  diffUrl?: string
  baselineRun?: string
  approvedAt?: string
}

/** Comparisons and image evidence are a read-only snapshot of the files at review load. */
export function buildComparison(
  runDir: string,
  run: RunRecord,
): {
  report: { comparedAt: string; threshold: number; tiles: Record<string, ComparisonEntry> }
  images: Map<string, Uint8Array>
} {
  const snapshot = randomUUID()
  const directory = realpathSync(runDir)
  const baselineDir = join(dirname(dirname(directory)), 'baselines')
  const config = readJson<{ threshold?: number }>(join(directory, 'diff.json'))
  const value = config?.threshold
  const threshold =
    typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1 ? value : 0.002
  const manifest = readJson<{ tiles?: Record<string, { run?: string; approvedAt?: string }> }>(
    join(baselineDir, 'manifest.json'),
  )
  const tiles: Record<string, ComparisonEntry> = {}
  const images = new Map<string, Uint8Array>()
  for (const tile of run.tiles) {
    try {
      const currentPath = containedPng(directory, tile.file)
      if (tile.error || !currentPath) {
        tiles[tile.id] = { status: 'no-capture' }
        continue
      }
      const baselinePath = containedPng(baselineDir, tile.file)
      if (!baselinePath) {
        tiles[tile.id] = { status: 'new' }
        continue
      }
      const baseline = readFileSync(baselinePath)
      const result = compareImages(
        PNG.sync.read(baseline),
        PNG.sync.read(readFileSync(currentPath)),
        threshold,
      )
      const key = `${snapshot}/${encodeURIComponent(tile.id)}`
      images.set(`baseline/${key}`, baseline)
      const entry: ComparisonEntry = {
        status: result.sizeMismatch ? 'size-changed' : result.exceeds ? 'changed' : 'unchanged',
        baselineUrl: `/comparison/baseline/${key}`,
        baselineRun: manifest?.tiles?.[tile.id]?.run,
        approvedAt: manifest?.tiles?.[tile.id]?.approvedAt,
      }
      if (!result.sizeMismatch) entry.ratio = result.ratio
      if (result.diff) {
        images.set(`diff/${key}`, PNG.sync.write(result.diff))
        entry.diffUrl = `/comparison/diff/${key}`
      }
      tiles[tile.id] = entry
    } catch {
      tiles[tile.id] = { status: 'unavailable' }
    }
  }
  return { report: { comparedAt: new Date().toISOString(), threshold, tiles }, images }
}

function containedPng(root: string, file: string): string | null {
  if (!file.endsWith('.png') || !existsSync(root)) return null
  const canonicalRoot = realpathSync(root)
  const path = resolve(canonicalRoot, file)
  if (!path.startsWith(canonicalRoot + sep) || !existsSync(path)) return null
  const canonical = realpathSync(path)
  return canonical.startsWith(canonicalRoot + sep) ? canonical : null
}
