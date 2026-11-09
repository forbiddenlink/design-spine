import { heapStats } from 'bun:jsc'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PNG } from 'pngjs'
import { buildComparison } from '../../src/lib/comparison.ts'
import { writeJson } from '../../src/lib/runs.ts'
import { startReviewServer } from '../../src/lib/server.ts'
import type { RunRecord, Tile } from '../../src/lib/types.ts'

// Synthetic fixtures only. Run from the repository with Bun; seconds default to two hours.
const durationSeconds = Number(process.argv[2] ?? 7200)
if (!Number.isFinite(durationSeconds) || durationSeconds < 30 || durationSeconds > 86400)
  throw new Error('Duration must be 30–86400 seconds')
const output = join(import.meta.dir, 'memory-soak.json')
const root = mkdtempSync(join(import.meta.dir, '.soak-'))
const runDir = join(root, 'runs', 'synthetic')
const baselines = join(root, 'baselines')
mkdirSync(runDir, { recursive: true })
mkdirSync(baselines)
const dimensions = [
  [390, 1800],
  [1280, 4000],
  [2048, 6144],
] as const
const distribution = [16, 6, 2]
const hash = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex')
function fixtures(): RunRecord {
  const tiles: Tile[] = []
  for (const [variant, [width, height]] of dimensions.entries()) {
    const png = new PNG({ width, height })
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4
        png.data[i] = 64 + (Math.floor(x / 8) % 128)
        png.data[i + 1] = 64 + (Math.floor(y / 8) % 128)
        png.data[i + 2] = 180
        png.data[i + 3] = 255
      }
    const baseline = PNG.sync.write(png)
    for (const top of [40, height - 120])
      for (let y = top; y < top + 80; y++)
        for (let x = 40; x < 200; x++) {
          const i = (y * width + x) * 4
          png.data[i] = png.data[i + 1] = png.data[i + 2] = 0
        }
    const current = PNG.sync.write(png)
    for (let copy = 0; copy < (distribution[variant] ?? 0); copy++) {
      const id = `synthetic-${variant}-${copy}`
      const file = `${id}.png`
      writeFileSync(join(runDir, file), current)
      writeFileSync(join(baselines, file), baseline)
      tiles.push({
        id,
        file,
        route: `/${id}`,
        path: `/${id}`,
        state: 'default',
        viewport: width,
        theme: 'light',
        status: 200,
        consoleErrors: [],
        pageErrors: [],
        brokenImages: [],
        textClipped: [],
        overflowX: false,
        blankRegions: { count: 0, boxes: [] },
        imageHash: hash(current),
        masks: [
          {
            selector: '#clock',
            reason: 'Synthetic volatile region',
            boxes: [{ x: 40, y: 40, w: 160, h: 80 }],
          },
        ],
      })
    }
  }
  const now = new Date().toISOString()
  return { id: 'synthetic', startedAt: now, finishedAt: now, baseUrl: 'http://example.test', tiles }
}

const run = fixtures()
writeJson(join(runDir, 'run.json'), run)
writeJson(join(runDir, 'review.json'), { tiles: {} })
// Keep hashes, never the reference's PNG buffers, throughout the measurement.
function reference(): Record<
  string,
  { ratio?: number; status: string; pixels?: number; regions: string; images: string[] }
> {
  const snapshot = buildComparison(runDir, run)
  return Object.fromEntries(
    Object.entries(snapshot.report.tiles).map(([id, tile]) => [
      id,
      {
        ratio: tile.ratio,
        status: tile.status,
        pixels: tile.diffPixels,
        regions: JSON.stringify(tile.regions),
        images: [tile.baselineUrl, tile.diffUrl].map((url) => {
          const bytes = url && snapshot.images.get(url.slice('/comparison/'.length))
          if (!bytes) throw new Error('Missing reference image')
          return hash(bytes)
        }),
      },
    ]),
  )
}
const expected = reference()
Bun.gc(true)
const server = startReviewServer(runDir, 0)
const base = `http://127.0.0.1:${server.port}`
const start = performance.now()
const report = {
  date: new Date().toISOString(),
  runtime: `Bun ${Bun.version}`,
  platform: `${process.platform}/${process.arch}`,
  requestedDurationSeconds: durationSeconds,
  dimensions,
  distribution,
  tiles: run.tiles.length,
  scope:
    'Synthetic low-entropy PNGs, active HTTP note saves, four retained evidence snapshots, 17-second idle periods every fourth comparison. Main-process heap counters exclude worker heaps; RSS includes workers. 100ms RSS sampling is not an exact allocation peak. No physical-device, high-entropy or universal memory-bound claim.',
  samples: [] as {
    label: string
    elapsedMs: number
    rss: number
    heapUsed: number
    external: number
    extraMemorySize: number
  }[],
  comparisons: [] as { elapsedMs: number; durationMs: number }[],
  saves: [] as number[],
  failures: [] as string[],
  peakSampledRss: 0,
  maxEventLoopLagMs: 0,
  elapsedMs: 0,
  complete: false,
}
function sample(label: string): void {
  const memory = process.memoryUsage()
  report.samples.push({
    label,
    elapsedMs: performance.now() - start,
    rss: memory.rss,
    heapUsed: memory.heapUsed,
    external: memory.external,
    extraMemorySize: heapStats().extraMemorySize,
  })
}
function checkpoint(): void {
  report.elapsedMs = performance.now() - start
  writeJson(output, report)
}
let nextTick = performance.now() + 100
const sampler = setInterval(() => {
  const now = performance.now()
  report.maxEventLoopLagMs = Math.max(report.maxEventLoopLagMs, now - nextTick)
  nextTick = now + 100
  report.peakSampledRss = Math.max(report.peakSampledRss, process.memoryUsage().rss)
  if (report.peakSampledRss > 2.5 * 1024 ** 3) {
    report.failures.push('2.5 GiB safety ceiling exceeded')
    checkpoint()
    rmSync(root, { recursive: true, force: true })
    process.exit(3)
  }
}, 100)
let saving: Promise<void> | undefined
let sequence = 0
const foreground = setInterval(() => {
  if (saving) return
  saving = (async () => {
    const before = performance.now()
    const note = `synthetic-save-${++sequence}`
    const response = await fetch(`${base}/api/review`, {
      method: 'POST',
      body: JSON.stringify({ tileId: run.tiles[0]?.id, note }),
      signal: AbortSignal.timeout(10_000),
    })
    const saved = (await response.json()) as { note?: string }
    if (!response.ok || saved.note !== note) throw new Error('Save response mismatch')
    const loaded = await fetch(`${base}/api/run?compare=false`, {
      signal: AbortSignal.timeout(10_000),
    })
    const data = (await loaded.json()) as { review: { tiles: Record<string, { note: string }> } }
    if (!loaded.ok || data.review.tiles[run.tiles[0]?.id ?? '']?.note !== note)
      throw new Error('Read-after-save mismatch')
    report.saves.push(performance.now() - before)
  })()
    .catch((error) => {
      report.failures.push(String(error))
    })
    .finally(() => {
      saving = undefined
    })
}, 1000)
const progress = setInterval(() => {
  sample('periodic')
  checkpoint()
}, 10_000)
const recent: string[] = []
sample('start')
console.log(JSON.stringify({ output, durationSeconds, tiles: run.tiles.length }))
try {
  while (performance.now() - start < durationSeconds * 1000 && !report.failures.length) {
    const before = performance.now()
    const response = await fetch(`${base}/api/comparison`, { signal: AbortSignal.timeout(180_000) })
    const data = (await response.json()) as {
      tiles: Record<
        string,
        {
          ratio?: number
          status: string
          diffPixels?: number
          regions?: unknown
          baselineUrl?: string
          diffUrl?: string
        }
      >
    }
    if (!response.ok || Object.keys(data.tiles).length !== run.tiles.length)
      throw new Error('Comparison count mismatch')
    for (const [id, tile] of Object.entries(data.tiles)) {
      const check = expected[id]
      if (
        !check ||
        tile.ratio !== check.ratio ||
        tile.status !== check.status ||
        tile.diffPixels !== check.pixels ||
        JSON.stringify(tile.regions) !== check.regions
      )
        throw new Error(`Comparison mismatch: ${id}`)
      for (const [index, url] of [tile.baselineUrl, tile.diffUrl].entries()) {
        const image = await fetch(base + url, { signal: AbortSignal.timeout(10_000) })
        if (!image.ok || hash(new Uint8Array(await image.arrayBuffer())) !== check.images[index])
          throw new Error(`Evidence mismatch: ${id}`)
      }
    }
    recent.push(Object.values(data.tiles)[0]?.baselineUrl ?? '')
    if (recent.length > 4) {
      const expired = await fetch(base + recent.shift(), { signal: AbortSignal.timeout(10_000) })
      if (expired.status !== 404) throw new Error('Old snapshot was not evicted')
      await expired.body?.cancel()
    }
    report.comparisons.push({
      elapsedMs: performance.now() - start,
      durationMs: performance.now() - before,
    })
    sample('comparison')
    if (report.comparisons.length % 4 === 0) {
      await Bun.sleep(17_000)
      sample('after-worker-idle')
    }
    checkpoint()
    console.log(
      JSON.stringify({
        comparisons: report.comparisons.length,
        seconds: Math.round(report.elapsedMs / 1000),
        saves: report.saves.length,
        rssMiB: Math.round(process.memoryUsage().rss / 1024 ** 2),
      }),
    )
  }
  if (report.failures.length) throw new Error('Foreground check failed')
  await Bun.sleep(17_000)
  sample('final-natural-idle')
  // Separate the diagnostic forced collection from natural production measurements.
  Bun.gc(true)
  await Bun.sleep(100)
  sample('final-forced-collection')
  report.complete = true
} catch (error) {
  report.failures.push(String(error))
} finally {
  clearInterval(foreground)
  await saving
  clearInterval(sampler)
  clearInterval(progress)
  checkpoint()
  server.stop(true)
  rmSync(root, { recursive: true, force: true })
}
if (report.failures.length) throw new Error(JSON.stringify(report.failures))
console.log(
  JSON.stringify({
    complete: report.complete,
    comparisons: report.comparisons.length,
    saves: report.saves.length,
    peakRssMiB: Math.round(report.peakSampledRss / 1024 ** 2),
  }),
)
