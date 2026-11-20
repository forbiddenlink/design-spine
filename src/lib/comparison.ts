import { randomUUID } from 'node:crypto'
import { readFileSync, realpathSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { Worker } from 'node:worker_threads'
import { PNG } from 'pngjs'
import { ariaIntact, structureDiff } from './aria.ts'
import { type CauseGroup, type CauseInput, groupByCause } from './cause.ts'
import { compareImages, ignoredBoxes, largestChangedRegion } from './diff.ts'
import { compatibleProvenance, findingsMatch } from './gate.ts'
import { containedPng, readJson } from './runs.ts'
import type { Box, Provenance, RunRecord } from './types.ts'

export interface ComparisonEntry {
  status:
    | 'new'
    | 'changed'
    | 'subtle'
    | 'structure-changed'
    | 'structure-unverified'
    | 'unchanged'
    | 'size-changed'
    | 'no-capture'
    | 'unavailable'
  ratio?: number
  /** Image size in pixels; lets the review UI describe where a change sits. */
  width?: number
  height?: number
  baselineUrl?: string
  diffUrl?: string
  baselineRun?: string
  approvedAt?: string
  diffPixels?: number
  regions?: Box[]
  ignored?: Box[]
  recipeCompatible?: boolean
  /** Capture bytes equal the approved baseline's, so its approval still stands. */
  identical?: boolean
  /** Accessibility-tree lines removed (`- `) and added (`+ `) since the baseline. */
  structure?: string[]
  provenance?: 'compatible' | 'incompatible' | 'unknown'
}

export interface ComparisonSnapshot {
  report: {
    comparedAt: string
    threshold: number
    tiles: Record<string, ComparisonEntry>
    /** Changed tiles that share a change signature; groups of two or more only. */
    groups: CauseGroup[]
  }
  images: Map<string, Uint8Array>
}

export function buildComparison(runDir: string, run: RunRecord): ComparisonSnapshot {
  const steps = comparisonSteps(runDir, run)
  let step = steps.next()
  while (!step.done) step = steps.next()
  return step.value
}

let comparisonQueue: Promise<void> = Promise.resolve()
let comparisonWorker: Worker | null = null
let idleTimer: ReturnType<typeof setTimeout> | undefined

function scheduleWorkerRelease(worker: Worker): void {
  idleTimer = setTimeout(() => {
    idleTimer = undefined
    comparisonWorker = null
    void worker.terminate().catch(() => {})
  }, 15_000)
  idleTimer.unref()
}

/** Keep native-size PNG work off the server thread and bound it to one job at a time. */
export function buildComparisonAsync(runDir: string, run: RunRecord): Promise<ComparisonSnapshot> {
  const task = comparisonQueue
    .catch(() => {})
    .then(
      () =>
        new Promise<ComparisonSnapshot>((resolve, reject) => {
          clearTimeout(idleTimer)
          // The build supplies the embedded entry; source runs resolve relative to this module.
          const workerEntry = new URL(
            import.meta.spineWorker ?? './comparison-worker.ts',
            import.meta.url,
          )
          const worker = comparisonWorker ?? new Worker(workerEntry)
          comparisonWorker = worker
          worker.ref()
          function cleanup(): void {
            worker.removeListener('message', onMessage)
            worker.removeListener('error', onError)
            worker.removeListener('exit', onExit)
          }
          function onMessage(message: { snapshot?: ComparisonSnapshot; error?: string }): void {
            cleanup()
            worker.unref()
            scheduleWorkerRelease(worker)
            if (message.error) reject(new Error(message.error))
            else if (!message.snapshot) reject(new Error('Comparison worker returned no evidence'))
            else resolve(message.snapshot)
          }
          function onError(error: unknown): void {
            cleanup()
            comparisonWorker = null
            reject(error instanceof Error ? error : new Error(String(error)))
          }
          function onExit(): void {
            cleanup()
            comparisonWorker = null
            reject(new Error('Comparison worker exited without evidence'))
          }
          worker.once('message', onMessage)
          worker.once('error', onError)
          worker.once('exit', onExit)
          worker.postMessage({ runDir, run })
        }),
    )
  // Serialize completion without retaining the caller's screenshot evidence.
  comparisonQueue = task.then(
    () => {},
    () => {},
  )
  return task
}

export function* comparisonSteps(
  runDir: string,
  run: RunRecord,
): Generator<void, ComparisonSnapshot, void> {
  const snapshot = randomUUID()
  const directory = realpathSync(runDir)
  const baselineDir = join(dirname(dirname(directory)), 'baselines')
  const config = readJson<{
    threshold?: number
    pixelThreshold?: number
    maxRegionPixels?: number
  }>(join(directory, 'diff.json'))
  const unit = (value: unknown, fallback: number): number =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
      ? value
      : fallback
  const threshold = unit(config?.threshold, 0.002)
  const pixelThreshold = unit(config?.pixelThreshold, 0.1)
  // diff --max-region fails a tile on one large changed area; review must call it changed too.
  const maxRegion =
    Number.isSafeInteger(config?.maxRegionPixels) && (config?.maxRegionPixels ?? 0) > 0
      ? config?.maxRegionPixels
      : undefined
  const manifest = readJson<{
    tiles?: Record<
      string,
      {
        run?: string
        findings?: string[]
        approvedAt?: string
        provenance?: Provenance
        recipeHash?: string
        ariaHash?: string
        masks?: Box[]
      }
    >
  }>(join(baselineDir, 'manifest.json'))
  const tiles: Record<string, ComparisonEntry> = {}
  const images = new Map<string, Uint8Array>()
  for (const tile of run.tiles) {
    yield
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
      const current = readFileSync(currentPath)
      const baseImage = PNG.sync.read(baseline)
      // Identical encoded files need one decode; still validate PNG and render full diff evidence.
      const currentImage = baseline.equals(current) ? baseImage : PNG.sync.read(current)
      const baselineMeta = manifest?.tiles?.[tile.id]
      const ignored = ignoredBoxes(tile, baselineMeta?.masks)
      let result = compareImages(baseImage, currentImage, threshold, pixelThreshold, ignored)
      if (
        maxRegion !== undefined &&
        !result.exceeds &&
        result.diff &&
        result.diffPixels > maxRegion &&
        largestChangedRegion(result.diff) > maxRegion
      )
        result = { ...result, exceeds: true }
      // A subtle change has no perceptual diff pixels to show; render exact differences instead.
      const subtle = !!result.subtle
      // Keep the exact ratio diff reported; the evidence pass only supplies the image and regions.
      if (subtle)
        result = {
          ...compareImages(baseImage, currentImage, 1, 0, ignored),
          ratio: result.exactRatio ?? result.ratio,
          subtle,
        }
      const structure = structureDiff(baselineDir, directory, tile)
      // A recorded snapshot that is missing or edited cannot vouch for the structure.
      const unverified =
        !ariaIntact(directory, tile.file, tile.ariaHash) ||
        !ariaIntact(baselineDir, tile.file, baselineMeta?.ariaHash)
      const key = `${snapshot}/${encodeURIComponent(tile.id)}`
      images.set(`baseline/${key}`, baseline)
      const entry: ComparisonEntry = {
        status: result.sizeMismatch
          ? 'size-changed'
          : subtle
            ? 'subtle'
            : result.exceeds
              ? 'changed'
              : unverified
                ? 'structure-unverified'
                : structure.length
                  ? 'structure-changed'
                  : 'unchanged',
        baselineUrl: `/comparison/baseline/${key}`,
        baselineRun: manifest?.tiles?.[tile.id]?.run,
        approvedAt: manifest?.tiles?.[tile.id]?.approvedAt,
        diffPixels: result.diffPixels,
        identical:
          baseline.equals(current) &&
          !structure.length &&
          !unverified &&
          findingsMatch(tile, baselineMeta?.findings),
        ...(structure.length ? { structure: structure.slice(0, 200) } : {}),
        regions: result.regions,
        ignored,
        recipeCompatible: !!tile.recipeHash && tile.recipeHash === baselineMeta?.recipeHash,
        provenance:
          !run.provenance || !baselineMeta?.provenance
            ? 'unknown'
            : compatibleProvenance(run.provenance, baselineMeta.provenance)
              ? 'compatible'
              : 'incompatible',
      }
      if (!result.sizeMismatch) {
        entry.ratio = result.ratio
        entry.width = baseImage.width
        entry.height = baseImage.height
      }
      if (result.diff) {
        images.set(`diff/${key}`, PNG.sync.write(result.diff))
        entry.diffUrl = `/comparison/diff/${key}`
      }
      tiles[tile.id] = entry
    } catch {
      tiles[tile.id] = { status: 'unavailable' }
    }
  }
  const causes: CauseInput[] = []
  for (const tile of run.tiles) {
    const entry = tiles[tile.id]
    if (
      (entry?.status === 'changed' || entry?.status === 'subtle') &&
      entry.regions &&
      entry.width &&
      entry.height
    )
      causes.push({
        id: tile.id,
        viewport: tile.viewport,
        theme: tile.theme,
        width: entry.width,
        height: entry.height,
        ratio: entry.ratio ?? 0,
        regions: entry.regions,
      })
  }
  return {
    report: {
      comparedAt: new Date().toISOString(),
      threshold,
      tiles,
      groups: groupByCause(causes),
    },
    images,
  }
}
