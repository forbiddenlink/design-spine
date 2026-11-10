import { readFileSync, realpathSync, statSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import { flagReasons } from './runs.ts'
import type { ReviewFile, RunRecord, Tile } from './types.ts'

const escapeHtml = (value: unknown): string =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  )

/** Self-contained evidence, with no remote resources, scripts, or session storage. */
export function buildReport(dir: string, run: RunRecord, review: ReviewFile): string {
  const root = realpathSync(dir)
  let bytes = 0
  // Legacy and hand-written runs may omit finding arrays; read them as empty.
  const reasons = (tile: Tile): string[] =>
    flagReasons({
      ...tile,
      consoleErrors: tile.consoleErrors ?? [],
      pageErrors: tile.pageErrors ?? [],
      brokenImages: tile.brokenImages ?? [],
      textClipped: tile.textClipped ?? [],
      overflowX: !!tile.overflowX,
      blankRegions: tile.blankRegions ?? { count: 0, boxes: [] },
    })
  // What needs attention first: rejected, then flagged or failed, then undecided, then approved.
  const rank = (tile: Tile): number => {
    const decision = review.tiles[tile.id]?.decision
    if (decision === 'reject') return 0
    if (decision !== 'approve' && reasons(tile).length) return 1
    if (!decision) return 2
    return 3
  }
  const ordered = run.tiles
    .map((tile, index) => ({ tile, index }))
    .sort((a, b) => rank(a.tile) - rank(b.tile) || a.index - b.index)
    .map(({ tile }) => tile)
  const count = (fn: (tile: Tile) => boolean): number => run.tiles.filter(fn).length
  const decided = (tile: Tile) => review.tiles[tile.id]?.decision
  const summary = [
    ['Screens', run.tiles.length],
    ['Approved', count((t) => decided(t) === 'approve')],
    ['Rejected', count((t) => decided(t) === 'reject')],
    ['Undecided', count((t) => !decided(t))],
    ['With findings', count((t) => reasons(t).length > 0)],
  ]
    .map(([label, value]) => `<li><b>${escapeHtml(value)}</b> ${escapeHtml(label)}</li>`)
    .join('')
  const index = ordered
    .map((tile) => {
      const why = reasons(tile)
      return `<li><a href="#tile-${escapeHtml(tile.id)}">${escapeHtml(tile.route)} · ${escapeHtml(tile.state)} · ${escapeHtml(tile.viewport)}px ${escapeHtml(tile.theme)}</a> · ${escapeHtml(decided(tile) ?? 'pending')}${why.length ? ` · ${escapeHtml(why.join('; '))}` : ''}</li>`
    })
    .join('')
  const cards = ordered
    .map((tile) => {
      const entry = review.tiles[tile.id]
      let image = ''
      if (!tile.error) {
        const path = realpathSync(resolve(root, tile.file))
        if (!path.startsWith(root + sep) || !path.endsWith('.png'))
          throw new Error('Screenshot outside run directory')
        bytes += statSync(path).size
        if (bytes > 100 * 1024 * 1024)
          throw new Error('Report exceeds 100 MiB of screenshots; export a smaller run.')
        const data = readFileSync(path)
        image = `<img loading="lazy" alt="${escapeHtml(tile.route)} · ${escapeHtml(tile.state)}" src="data:image/png;base64,${data.toString('base64')}">`
        // Draw what the checks found on the screenshot, as the review app does. Boxes are in image
        // pixels, so the overlay takes its size from the PNG header (IHDR width and height).
        const marks = [
          ...(tile.overflowOffenders ?? []).map((o) => ({ ...o.box, kind: 'overflow' })),
          ...(tile.blankRegions?.boxes ?? []).map((b) => ({ ...b, kind: 'blank' })),
        ].filter((b) => [b.x, b.y, b.w, b.h].every(Number.isFinite) && b.w > 0 && b.h > 0)
        if (marks.length && data.length > 24 && data.readUInt32BE(12) === 0x49484452) {
          const rects = marks
            .map(
              (b) =>
                `<rect class="${b.kind}" x="${Number(b.x)}" y="${Number(b.y)}" width="${Number(b.w)}" height="${Number(b.h)}"/>`,
            )
            .join('')
          image = `<div class="evidence">${image}<svg viewBox="0 0 ${data.readUInt32BE(16)} ${data.readUInt32BE(20)}" preserveAspectRatio="none" aria-hidden="true">${rects}</svg></div>`
        }
      }
      const findings = [
        ...(tile.expectedStatus
          ? tile.status !== tile.expectedStatus
            ? [`HTTP ${tile.status}, expected ${tile.expectedStatus}`]
            : []
          : tile.status === 0 || tile.status >= 400
            ? [`HTTP ${tile.status}`]
            : []),
        ...(tile.warnings ?? []),
        ...(tile.consoleErrors ?? []).map((message) => `Console: ${message}`),
        ...(tile.pageErrors ?? []).map((message) => `Page error: ${message}`),
        ...(tile.requestErrors ?? []).map(
          (error) =>
            `Request: ${error.status !== undefined ? `HTTP ${error.status}` : error.failure} · ${error.resourceType} · +${error.elapsedMs} ms · ${error.url}`,
        ),
        ...(tile.brokenImages ?? []).map((source) => `Broken image: ${source}`),
        ...(tile.textClipped ?? []).map((item) => `Possible clipped text: ${item.selector}`),
        ...(tile.overflowX
          ? tile.overflowOffenders?.length
            ? tile.overflowOffenders.map(
                (o) => `Horizontal overflow from ${o.selector} (${o.cssWidth ?? o.box.w}px wide)`,
              )
            : ['Horizontal overflow']
          : []),
        ...(tile.blankRegions?.count ? [`${tile.blankRegions.count} possible blank regions`] : []),
        ...(tile.redirectedTo ? [`Redirected to ${tile.redirectedTo}`] : []),
        ...(tile.diagnostic ? [`${tile.diagnostic.stage}: ${tile.diagnostic.message}`] : []),
        ...(tile.accessibility?.error ? [`Accessibility scan: ${tile.accessibility.error}`] : []),
        ...(tile.accessibility?.violations ?? []).map(
          (issue) =>
            `${issue.id} (${issue.impact ?? 'unknown impact'}): ${issue.help}; ${issue.targets.join(', ')}`,
        ),
      ]
      const diagnostics = `<details><summary>Capture findings (${findings.length})</summary><p>Accessibility: ${escapeHtml(tile.accessibility?.engine ?? 'not checked')}. Automated checks are partial.</p><ul>${findings.map((message) => `<li>${escapeHtml(message)}</li>`).join('')}</ul></details>`
      return `<article id="tile-${escapeHtml(tile.id)}"><h2>${escapeHtml(tile.route)} · ${escapeHtml(tile.state)}</h2><p>${escapeHtml(tile.viewport)}px · ${escapeHtml(tile.theme)} · ${escapeHtml(entry?.decision ?? 'pending')} · ${escapeHtml(tile.stability ?? 'stability unchecked')}</p>${tile.error ? `<p>Capture failed: ${escapeHtml(tile.error)}</p>` : image}<p class="note">${escapeHtml(entry?.note)}</p>${diagnostics}${entry?.anchor ? `<p>Note location: ${escapeHtml(entry.anchor.x)}, ${escapeHtml(entry.anchor.y)} · image ${escapeHtml(entry.anchor.imageHash)}</p>` : ''}${tile.masks?.length ? `<p>Comparison masks: ${escapeHtml(tile.masks.map((mask) => `${mask.selector}: ${mask.reason}`).join('; '))}. Original screenshot retained.</p>` : ''}</article>`
    })
    .join('\n')
  const coverage = run.coverage
    ? `<ul>${run.coverage.map((entry) => `<li>${escapeHtml(entry.route)} · ${escapeHtml(entry.state)} · ${escapeHtml(entry.viewport)}px · ${escapeHtml(entry.theme)}: ${escapeHtml(entry.outcome)} ${escapeHtml(entry.reason)}</li>`).join('')}</ul>`
    : '<p>Coverage unknown. This legacy run cannot establish complete coverage.</p>'
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'"><title>Design Spine · ${escapeHtml(run.id)}</title><style>body{max-width:1000px;margin:32px auto;padding:0 20px;font:16px/1.5 system-ui;background:#f7f6f2;color:#20231f}article{border-top:1px solid #999;margin-top:32px;padding-top:16px}img{max-width:100%;height:auto}.evidence{position:relative;display:inline-block;max-width:100%}.evidence img{display:block}.evidence svg{position:absolute;inset:0;width:100%;height:100%}.evidence rect{fill:#efb62c26;stroke:#a24c00;stroke-width:2;vector-effect:non-scaling-stroke}.evidence rect.overflow{fill:none;stroke:#a83232;stroke-dasharray:6 4}pre,.note{white-space:pre-wrap;overflow-wrap:anywhere}li{overflow-wrap:anywhere}.summary{display:flex;flex-wrap:wrap;gap:8px 24px;list-style:none;padding:0}.summary b{font-size:24px}</style><main><h1>Design Spine review</h1><p>${escapeHtml(run.id)} · ${escapeHtml(run.baseUrl)}</p><p>Saved review decisions; this report does not approve or update baselines.</p><ul class="summary">${summary}</ul><details><summary>Screens, rejected and flagged first (${run.tiles.length})</summary><ol>${index}</ol></details><details><summary>Coverage and capture environment</summary>${coverage}<pre>${escapeHtml(run.provenance ? JSON.stringify(run.provenance, null, 2) : 'Provenance unknown')}</pre></details>${cards}</main></html>`
}
