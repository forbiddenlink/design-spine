import { readFileSync, realpathSync, statSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import type { ReviewFile, RunRecord } from './types.ts'

const escapeHtml = (value: unknown): string =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  )

/** Self-contained evidence, with no remote resources, scripts, or session storage. */
export function buildReport(dir: string, run: RunRecord, review: ReviewFile): string {
  const root = realpathSync(dir)
  let bytes = 0
  const cards = run.tiles
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
        image = `<img alt="${escapeHtml(tile.route)}" src="data:image/png;base64,${readFileSync(path).toString('base64')}">`
      }
      const findings = [
        ...(tile.status === 0 || tile.status >= 400 ? [`HTTP ${tile.status}`] : []),
        ...(tile.warnings ?? []),
        ...(tile.consoleErrors ?? []).map((message) => `Console: ${message}`),
        ...(tile.pageErrors ?? []).map((message) => `Page error: ${message}`),
        ...(tile.requestErrors ?? []).map(
          (error) =>
            `Request: ${error.status !== undefined ? `HTTP ${error.status}` : error.failure} · ${error.resourceType} · +${error.elapsedMs} ms · ${error.url}`,
        ),
        ...(tile.brokenImages ?? []).map((source) => `Broken image: ${source}`),
        ...(tile.textClipped ?? []).map((item) => `Possible clipped text: ${item.selector}`),
        ...(tile.overflowX ? ['Horizontal overflow'] : []),
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
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'"><title>Design Spine · ${escapeHtml(run.id)}</title><style>body{max-width:1000px;margin:32px auto;padding:0 20px;font:16px/1.5 system-ui;background:#f7f6f2;color:#20231f}article{border-top:1px solid #999;margin-top:32px;padding-top:16px}img{max-width:100%;height:auto}pre,.note{white-space:pre-wrap;overflow-wrap:anywhere}li{overflow-wrap:anywhere}</style><h1>Design Spine review</h1><p>${escapeHtml(run.id)} · ${escapeHtml(run.baseUrl)}</p><p>Saved review decisions; this report does not approve or update baselines.</p><details><summary>Coverage and capture environment</summary>${coverage}<pre>${escapeHtml(run.provenance ? JSON.stringify(run.provenance, null, 2) : 'Provenance unknown')}</pre></details>${cards}</html>`
}
