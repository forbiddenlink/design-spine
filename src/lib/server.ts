import { realpathSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import UI_PATH from '../ui/index.html' with { type: 'file' }
import { buildComparisonAsync } from './comparison.ts'
import { mergeReview } from './review.ts'
import { loadCritique, loadReview, loadRun, writeJson } from './runs.ts'
import type { Decision, ReviewFile } from './types.ts'

export function startReviewServer(runDir: string, port: number) {
  const imgRoot = resolve(runDir)
  const comparisonSnapshots: Map<string, Uint8Array>[] = []
  return Bun.serve({
    port,
    idleTimeout: 120,
    async fetch(req) {
      const url = new URL(req.url)
      if (req.method === 'GET' && url.pathname === '/') {
        return new Response(Bun.file(String(UI_PATH)), {
          headers: { 'content-type': 'text/html; charset=utf-8' },
        })
      }
      if (req.method === 'GET' && url.pathname === '/api/run') {
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
          comparison: comparison?.report,
          review: loadReview(runDir),
          critique: loadCritique(runDir),
        })
      }
      if (req.method === 'GET' && url.pathname === '/api/comparison') {
        const comparison = await buildComparisonAsync(runDir, loadRun(runDir))
        comparisonSnapshots.push(comparison.images)
        if (comparisonSnapshots.length > 4) comparisonSnapshots.shift()
        return Response.json(comparison.report, { headers: { 'cache-control': 'no-store' } })
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
        const body = (await req.json().catch(() => null)) as {
          tileId?: string
          decision?: Decision | null
          note?: string
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
        let existing: ReviewFile
        try {
          existing = loadReview(runDir)
        } catch (error) {
          return Response.json({ error: (error as Error).message }, { status: 503 })
        }
        const merged = mergeReview(existing, {
          tileId: body.tileId,
          decision: body.decision,
          note: typeof body.note === 'string' ? body.note.slice(0, 2000) : undefined,
        })
        writeJson(join(runDir, 'review.json'), merged)
        return Response.json(merged.tiles[body.tileId])
      }
      return new Response('not found', { status: 404 })
    },
  })
}
