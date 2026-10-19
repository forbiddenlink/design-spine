import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { PNG } from 'pngjs'
import type { CoverageEntry, ReviewFile, Tile } from '../../src/lib/types.ts'

export async function reviewFixture(
  options: { missingApprovedCapture?: boolean; diagnostics?: boolean } = {},
): Promise<{ url: string; close: () => void }> {
  const root = mkdtempSync(join(tmpdir(), 'spine-workflow-'))
  const dir = join(root, '.design-spine/runs/example')
  mkdirSync(dir, { recursive: true })
  const tiles: Tile[] = []
  const review: ReviewFile = { tiles: {} }
  for (let route = 0; route < 8; route++) {
    for (const state of ['ideal', 'empty']) {
      for (const viewport of [390, 1280]) {
        for (const theme of ['light', 'dark'] as const) {
          const id = `route-${route}-${state}-${viewport}-${theme}`
          const png = new PNG({ width: viewport, height: 600 })
          for (let y = 0; y < png.height; y++) {
            for (let x = 0; x < png.width; x++) {
              const index = (y * png.width + x) * 4
              const bar =
                x > 24 && x < png.width - 24 && ((y > 40 && y < 80) || (y > 125 && y < 300))
              const color = bar ? (theme === 'light' ? 155 : 98) : theme === 'light' ? 245 : 30
              png.data[index] = color
              png.data[index + 1] = bar ? color + 12 : color
              png.data[index + 2] = color
              png.data[index + 3] = 255
            }
          }
          const bytes = PNG.sync.write(png)
          writeFileSync(join(dir, `${id}.png`), bytes)
          const path =
            route === 7
              ? '/projects/a-very-long-project-name/releases/review-workflow-improvements'
              : `/projects/${route}`
          tiles.push({
            id,
            file: `${id}.png`,
            route: path,
            path,
            state,
            viewport,
            theme,
            status: 200,
            consoleErrors: [],
            pageErrors: [],
            brokenImages: [],
            textClipped: [],
            overflowX: false,
            blankRegions: { count: 0, boxes: [] },
            imageHash: createHash('sha256').update(bytes).digest('hex'),
          })
          if (route === 0 && state === 'ideal')
            review.tiles[id] = {
              decision: theme === 'light' ? 'approve' : 'reject',
              note: theme === 'dark' ? 'Check the empty panel.' : '',
              updatedAt: '2026-10-18T12:00:00Z',
            }
        }
      }
    }
  }
  if (options.missingApprovedCapture) rmSync(join(dir, 'route-0-ideal-390-light.png'))
  if (options.diagnostics) {
    const [overlay, requests, clipped] = tiles
    const late = tiles[62]
    if (!overlay || !requests || !clipped || !late) throw new Error('Missing diagnostic fixtures')
    overlay.warnings = ['Fixed overlay covers 36% of viewport: cookie notice']
    late.warnings = ['Assets did not settle']
    clipped.textClipped = [{ selector: 'p', text: 'Clipped example' }]
    requests.requestErrors = [
      {
        url: 'https://example.test/api/<unsafe>',
        status: 429,
        resourceType: 'fetch',
        elapsedMs: 123,
      },
      {
        url: 'https://example.test/image.png',
        failure: 'net::ERR_FAILED',
        resourceType: 'image',
        elapsedMs: 456,
      },
    ]
  }
  const failed = tiles[63]
  if (failed) failed.error = 'Readiness selector did not appear'
  const coverage: CoverageEntry[] = tiles.map((tile) => ({
    ...tile,
    outcome: tile.error ? 'failed' : 'captured',
  }))
  for (const [index, outcome] of (
    ['skipped', 'excluded', 'filtered', 'planned', 'captured'] as const
  ).entries()) {
    coverage.push({
      id: `missing-${index}`,
      route: '/checkout',
      state: outcome,
      viewport: 390,
      theme: 'light',
      outcome,
      reason: 'Synthetic coverage example',
    })
  }
  writeFileSync(
    join(dir, 'run.json'),
    JSON.stringify({ id: 'example', baseUrl: 'http://example.test', tiles, coverage }),
  )
  writeFileSync(join(dir, 'review.json'), JSON.stringify(review))
  const script = join(root, 'server.ts')
  writeFileSync(
    script,
    `import { startReviewServer } from ${JSON.stringify(resolve('src/lib/server.ts'))}; const server = startReviewServer(${JSON.stringify(dir)}, 0); console.log('READY '+server.port);`,
  )
  const binary = process.env.SPINE_REVIEW_BIN
  const child = spawn(
    binary ? resolve(binary) : 'bun',
    binary ? ['review', '--run', dir, '--port', '0'] : [script],
    { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] },
  )
  let errors = ''
  child.stderr.on('data', (data) => {
    errors += String(data)
  })
  const close = (): void => {
    child.kill()
    rmSync(root, { recursive: true, force: true })
  }
  try {
    const port = await new Promise<string>((resolvePort, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`Fixture server timed out: ${errors}`)),
        15000,
      )
      child.stdout.on('data', (data) => {
        const match = String(data).match(/(?:READY |http:\/\/localhost:)(\d+)/)
        if (match?.[1]) {
          clearTimeout(timer)
          resolvePort(match[1])
        }
      })
      child.once('error', (error) => {
        clearTimeout(timer)
        reject(error)
      })
      child.once('exit', () => {
        clearTimeout(timer)
        reject(new Error(`Fixture server exited: ${errors}`))
      })
    })
    return { url: `http://127.0.0.1:${port}`, close }
  } catch (error) {
    close()
    throw error
  }
}
