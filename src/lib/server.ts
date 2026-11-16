import { readFileSync, realpathSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { PNG } from 'pngjs'
import UI_FONT from '../ui/fonts/archivo-latin-wdth.woff2' with { type: 'file' }
import UI_PATH from '../ui/index.html' with { type: 'file' }
import UI_CSS from '../ui/review.css' with { type: 'file' }
import UI_JS from '../ui/review.js' with { type: 'file' }
import { buildComparisonAsync } from './comparison.ts'
import { sha256 } from './hash.ts'
import { listRuns, selectRun } from './history.ts'
import { buildReport } from './report.ts'
import { mergeReview } from './review.ts'
import { containedPng, flagReasons, loadCritique, loadReview, loadRun, writeJson } from './runs.ts'
import type { Decision, ReviewEntry, ReviewFile, Tile } from './types.ts'

/** 409 when the screenshot on disk is no longer the one that was captured (or the reviewer saw). */
function changedEvidence(imgRoot: string, tile: Tile, imageHash?: string): Response | null {
  if (!tile.imageHash) return null
  try {
    const path = containedPng(imgRoot, tile.file)
    if (!path) throw new Error('Invalid screenshot')
    if (
      (imageHash !== undefined && imageHash !== tile.imageHash) ||
      sha256(readFileSync(path)) !== tile.imageHash
    )
      throw new Error('Changed evidence')
    return null
  } catch {
    return Response.json(
      { error: 'Screenshot changed after capture; reload or recapture before reviewing.' },
      { status: 409 },
    )
  }
}

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
    if (req.method === 'GET' && url.pathname === '/assets/archivo.woff2')
      return new Response(Bun.file(String(UI_FONT)), {
        headers: { 'content-type': 'font/woff2', 'cache-control': 'max-age=86400' },
      })
    if (
      req.method === 'GET' &&
      ['/assets/review.css', '/assets/review.js'].includes(url.pathname)
    ) {
      const css = url.pathname.endsWith('.css')
      return new Response(Bun.file(String(css ? UI_CSS : UI_JS)), {
        headers: {
          'content-type': css ? 'text/css; charset=utf-8' : 'text/javascript; charset=utf-8',
          'cache-control': 'no-cache',
        },
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
      const p = containedPng(imgRoot, file)
      if (!p) return new Response('not found', { status: 404 })
      return new Response(Bun.file(p), { headers: { 'content-type': 'image/png' } })
    }
    if (req.method === 'POST' && url.pathname === '/api/review/bulk') {
      const origin = req.headers.get('origin')
      if (origin && origin !== url.origin)
        return new Response('Cross-origin review changes refused', { status: 403 })
      const body = (await req.json().catch(() => null)) as {
        tileIds?: unknown
        decision?: unknown
        note?: unknown
        confirmed?: unknown
        imageHashes?: Record<string, string>
      } | null
      // One person-confirmed batch: every id was listed in the dialog they approved.
      if (body?.confirmed !== true)
        return Response.json(
          { error: 'Bulk decisions need explicit confirmation' },
          { status: 400 },
        )
      if (body.decision !== 'approve' && body.decision !== 'reject')
        return Response.json({ error: 'bad decision' }, { status: 400 })
      const ids = body.tileIds
      if (
        !Array.isArray(ids) ||
        !ids.length ||
        ids.length > 500 ||
        !ids.every((id) => typeof id === 'string') ||
        new Set(ids).size !== ids.length
      )
        return Response.json(
          { error: 'tileIds must be a list of distinct tile ids' },
          { status: 400 },
        )
      const run = loadRun(runDir)
      const tiles = ids.map((id) => run.tiles.find((t) => t.id === id))
      if (tiles.some((t) => !t)) return Response.json({ error: 'unknown tileId' }, { status: 400 })
      const note = typeof body.note === 'string' ? body.note.slice(0, 2000) : undefined
      // All or nothing: one refused tile stops the batch so the reviewer sees a single reason.
      for (const tile of tiles as Tile[]) {
        const stale = changedEvidence(imgRoot, tile, body.imageHashes?.[tile.id])
        if (stale) return stale
        if (body.decision !== 'approve') continue
        if (tile.error)
          return Response.json(
            { error: `${tile.id} failed to capture (${tile.error}); it cannot be approved.` },
            { status: 422 },
          )
        const reasons = flagReasons(tile)
        if (reasons.length && !note?.trim())
          return Response.json(
            {
              error: `${tile.route} · ${tile.state} has findings (${reasons.join('; ')}). Add a note saying why they are acceptable, then approve.`,
            },
            { status: 422 },
          )
      }
      let merged: ReviewFile
      try {
        merged = loadReview(runDir)
      } catch (error) {
        return Response.json({ error: (error as Error).message }, { status: 503 })
      }
      const now = new Date().toISOString()
      for (const id of ids as string[])
        merged = mergeReview(merged, { tileId: id, decision: body.decision, note }, now)
      writeJson(join(runDir, 'review.json'), merged)
      return Response.json({
        tiles: Object.fromEntries((ids as string[]).map((id) => [id, merged.tiles[id]])),
      })
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
      const tile = loadRun(runDir).tiles.find((t) => t.id === body?.tileId)
      if (!body?.tileId || !tile) {
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
      const changed = changedEvidence(imgRoot, tile, body.imageHash)
      if (changed) return changed
      if (body.anchor !== undefined && body.anchor !== null) {
        try {
          if (tile.error) throw new Error('No screenshot')
          const path = containedPng(imgRoot, tile.file)
          if (!path) throw new Error('Invalid screenshot')
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
            anchor.imageHash !== sha256(bytes)
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
      // A failed capture has no screenshot to promote; `spine approve` would refuse the whole batch.
      if (body.decision === 'approve' && tile.error)
        return Response.json(
          { error: `This capture failed (${tile.error}). Recapture it; it cannot be approved.` },
          { status: 422 },
        )
      // Automatic findings never count as approval, and approving past them needs a written reason.
      const reasons = flagReasons(tile)
      if (body.decision === 'approve' && reasons.length && !merged.tiles[body.tileId]?.note.trim())
        return Response.json(
          {
            error: `This screen has findings (${reasons.join('; ')}). Add a note saying why they are acceptable, then approve.`,
          },
          { status: 422 },
        )
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
