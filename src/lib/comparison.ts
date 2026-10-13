import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { Worker } from 'node:worker_threads'
import { PNG } from 'pngjs'
import { compareImages } from './diff.ts'
import { compatibleProvenance } from './gate.ts'
import { readJson } from './runs.ts'
import type { Box, Provenance, RunRecord } from './types.ts'

export interface ComparisonEntry {
  status: 'new' | 'changed' | 'unchanged' | 'size-changed' | 'no-capture' | 'unavailable'
  ratio?: number
  baselineUrl?: string
  diffUrl?: string
  baselineRun?: string
  approvedAt?: string
  diffPixels?: number
  regions?: Box[]
  ignored?: Box[]
  recipeCompatible?: boolean
  provenance?: 'compatible' | 'incompatible' | 'unknown'
}

export interface ComparisonSnapshot {
  report: { comparedAt: string; threshold: number; tiles: Record<string, ComparisonEntry> }
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
  const config = readJson<{ threshold?: number }>(join(directory, 'diff.json'))
  const value = config?.threshold
  const threshold =
    typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1 ? value : 0.002
  const manifest = readJson<{
    tiles?: Record<
      string,
      {
        run?: string
        approvedAt?: string
        provenance?: Provenance
        recipeHash?: string
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
      const ignored = [
        ...(tile.masks ?? []).flatMap((mask) => mask.boxes),
        ...(baselineMeta?.masks ?? []),
      ]
      const result = compareImages(baseImage, currentImage, threshold, 0.1, ignored)
      const key = `${snapshot}/${encodeURIComponent(tile.id)}`
      images.set(`baseline/${key}`, baseline)
      const entry: ComparisonEntry = {
        status: result.sizeMismatch ? 'size-changed' : result.exceeds ? 'changed' : 'unchanged',
        baselineUrl: `/comparison/baseline/${key}`,
        baselineRun: manifest?.tiles?.[tile.id]?.run,
        approvedAt: manifest?.tiles?.[tile.id]?.approvedAt,
        diffPixels: result.diffPixels,
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
