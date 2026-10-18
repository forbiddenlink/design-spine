import { createHash } from 'node:crypto'
import { readFileSync, realpathSync } from 'node:fs'
import { basename, join, resolve, sep } from 'node:path'
import { PNG } from 'pngjs'
import UI_PATH from '../ui/index.html' with { type: 'file' }
import { buildComparisonAsync } from './comparison.ts'
import { listRuns, selectRun } from './history.ts'
import { buildReport } from './report.ts'
import { mergeReview } from './review.ts'
import { loadCritique, loadReview, loadRun, writeJson } from './runs.ts'
import type { Decision, ReviewEntry, ReviewFile } from './types.ts'

export function startReviewServer(initialRunDir: string, port: number) {
  const comparisonSnapshots: Map<string, Uint8Array>[] = []
  const handle = async (req: Request): Promise<Response> => {
    const url = new URL(req.url)
    if (!['127.0.0.1', 'localhost'].includes(url.hostname))
      return new Response('Untrusted review host', { status: 403 })
    let runDir: string
    try {
      runDir = selectRun(initialRunDir, url.searchParams.get('run'))
    } catch {
      return new Response('Run not found', { status: 404 })
    }
    const imgRoot = resolve(runDir)
    if (req.method === 'GET' && url.pathname === '/api/runs')
      return Response.json(listRuns(initialRunDir))
    if (req.method === 'GET' && url.pathname === '/') {
      return new Response(Bun.file(String(UI_PATH)), {
        headers: { 'content-type': 'text/html; charset=utf-8' },
      })
    }
    if (req.method === 'GET' && url.pathname === '/api/report') {
      try {
        return new Response(buildReport(runDir, loadRun(runDir), loadReview(runDir)), {
          headers: {
            'content-type': 'text/html; charset=utf-8',
            'content-disposition': 'attachment; filename="design-spine-report.html"',
          },
        })
      } catch {
        return new Response('Report unavailable; check run evidence and size.', { status: 422 })
      }
    }
    if (req.method === 'GET' && url.pathname === '/api/run') {
      try {
        const run = loadRun(runDir)
        const comparison =
          url.searchParams.get('compare') === 'false'
            ? null
            : await buildComparisonAsync(runDir, run)
        if (comparison) {
          comparisonSnapshots.push(comparison.images)
          if (comparisonSnapshots.length > 4) comparisonSnapshots.shift()
        }
        return Response.json({
          run,
          runKey: basename(realpathSync(runDir)),
          comparison: comparison?.report,
          review: loadReview(runDir),
          critique: loadCritique(runDir),
        })
      } catch (error) {
        return Response.json({ error: (error as Error).message }, { status: 422 })
      }
    }
    if (req.method === 'GET' && url.pathname === '/api/comparison') {
      try {
        const comparison = await buildComparisonAsync(runDir, loadRun(runDir))
        comparisonSnapshots.push(comparison.images)
        if (comparisonSnapshots.length > 4) comparisonSnapshots.shift()
        return Response.json(comparison.report, { headers: { 'cache-control': 'no-store' } })
      } catch (error) {
        return Response.json({ error: (error as Error).message }, { status: 422 })
      }
    }
    if (req.method === 'GET' && url.pathname.startsWith('/comparison/')) {
      const key = url.pathname.slice('/comparison/'.length)
      const image = comparisonSnapshots.map((snapshot) => snapshot.get(key)).find(Boolean)
      return image
        ? new Response(new Uint8Array(image), {
            headers: { 'content-type': 'image/png', 'cache-control': 'no-store' },
          })
        : new Response('not found', { status: 404 })
    }
    if (req.method === 'GET' && url.pathname.startsWith('/img/')) {
      let file: string
      try {
        file = decodeURIComponent(url.pathname.slice(5))
      } catch {
        return new Response('invalid image path', { status: 400 })
      }
      if (!loadRun(runDir).tiles.some((tile) => tile.file === file)) {
        return new Response('not found', { status: 404 })
      }
      let p: string
      try {
        p = realpathSync(resolve(join(imgRoot, file)))
        const canonicalRoot = realpathSync(imgRoot)
        if (!p.startsWith(canonicalRoot + sep) || !p.endsWith('.png')) {
          return new Response('not found', { status: 404 })
        }
      } catch {
        return new Response('not found', { status: 404 })
      }
      return new Response(Bun.file(p), { headers: { 'content-type': 'image/png' } })
    }
    if (req.method === 'POST' && url.pathname === '/api/review') {
      const origin = req.headers.get('origin')
      if (origin && origin !== url.origin)
        return new Response('Cross-origin review changes refused', { status: 403 })
      const body = (await req.json().catch(() => null)) as {
        tileId?: string
        decision?: Decision | null
        note?: string
        anchor?: ReviewEntry['anchor'] | null
        imageHash?: string
      } | null
      const known = new Set(loadRun(runDir).tiles.map((t) => t.id))
      if (!body?.tileId || !known.has(body.tileId)) {
        return Response.json({ error: 'unknown tileId' }, { status: 400 })
      }
      if (
        body.decision !== undefined &&
        body.decision !== null &&
        body.decision !== 'approve' &&
        body.decision !== 'reject'
      ) {
        return Response.json({ error: 'bad decision' }, { status: 400 })
      }
      const tile = loadRun(runDir).tiles.find((tile) => tile.id === body.tileId)
      if (tile?.imageHash) {
        try {
          const path = realpathSync(resolve(imgRoot, tile.file))
          if (!path.startsWith(realpathSync(imgRoot) + sep) || !path.endsWith('.png'))
            throw new Error('Invalid screenshot')
          if (
            (body.imageHash !== undefined && body.imageHash !== tile.imageHash) ||
            createHash('sha256').update(readFileSync(path)).digest('hex') !== tile.imageHash
          )
            throw new Error('Changed evidence')
        } catch {
          return Response.json(
            { error: 'Screenshot changed after capture; reload or recapture before reviewing.' },
            { status: 409 },
          )
        }
      }
      if (body.anchor !== undefined && body.anchor !== null) {
        try {
          const tile = loadRun(runDir).tiles.find((tile) => tile.id === body.tileId)
          if (!tile || tile.error) throw new Error('No screenshot')
          const path = realpathSync(resolve(imgRoot, tile.file))
          if (!path.startsWith(realpathSync(imgRoot) + sep) || !path.endsWith('.png'))
            throw new Error('Invalid screenshot')
          const bytes = readFileSync(path)
          const image = PNG.sync.read(bytes)
          const anchor = body.anchor
          if (
            !Number.isFinite(anchor.x) ||
            !Number.isFinite(anchor.y) ||
            anchor.x < 0 ||
            anchor.y < 0 ||
            anchor.x >= image.width ||
            anchor.y >= image.height ||
            anchor.imageHash !== createHash('sha256').update(bytes).digest('hex')
          )
            throw new Error('Stale location')
        } catch {
          return Response.json(
            {
              error:
                'Note location is invalid or belongs to different evidence; reload the screenshot.',
            },
            { status: 409 },
          )
        }
      }
      let existing: ReviewFile
      try {
        existing = loadReview(runDir)
      } catch (error) {
        return Response.json({ error: (error as Error).message }, { status: 503 })
      }
      const merged = mergeReview(existing, {
        tileId: body.tileId,
        decision: body.decision,
        anchor: body.anchor,
        note: typeof body.note === 'string' ? body.note.slice(0, 2000) : undefined,
      })
      writeJson(join(runDir, 'review.json'), merged)
      return Response.json(merged.tiles[body.tileId])
    }
    return new Response('not found', { status: 404 })
  }
  return Bun.serve({
    port,
    hostname: '127.0.0.1',
    idleTimeout: 120,
    async fetch(req) {
      const res = await handle(req)
      res.headers.set('X-Frame-Options', 'DENY')
      // Append rather than add a second header, which browsers would intersect.
      const csp = res.headers.get('Content-Security-Policy')
      res.headers.set(
        'Content-Security-Policy',
        csp ? `${csp}; frame-ancestors 'none'` : "frame-ancestors 'none'",
      )
      return res
    },
  })
}
