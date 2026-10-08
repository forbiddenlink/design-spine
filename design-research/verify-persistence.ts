import { startReviewServer } from '../src/lib/server.ts'
import { writeJson } from '../src/lib/runs.ts'
import { writeFileSync } from 'node:fs'

const source = await (await fetch('http://localhost:14747/api/run')).json()
const dir = '/Volumes/LizsDisk/design-spine/design-research/.design-spine/runs/api-verification'
writeJson(dir + '/run.json', { ...source.run, id: 'api-verification', tiles: [source.run.tiles[0]] })
const server = startReviewServer(dir, 0)
const base = `http://localhost:${server.port}`
const checks: { check: string; passed: boolean }[] = []
function check(label: string, passed: boolean): void {
  checks.push({ check: label, passed })
  if (!passed) throw new Error(label)
}
async function patch(data: unknown): Promise<Response> {
  return fetch(base + '/api/review', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) })
}
try {
  const id = source.run.tiles[0].id
  check('unknown capture rejected', (await patch({ tileId: 'unknown', decision: 'approve' })).status === 400)
  check('invalid decision rejected', (await patch({ tileId: id, decision: 'maybe' })).status === 400)
  const first = await patch({ tileId: id, decision: 'approve', note: 'Verified local note' })
  check('decision and note save confirmed', first.ok && (await first.json()).note === 'Verified local note')
  await patch({ tileId: id, note: 'Updated without changing decision' })
  const read = await (await fetch(base + '/api/run')).json()
  check('partial patch preserves decision and reads from disk', read.review.tiles[id].decision === 'approve' && read.review.tiles[id].note === 'Updated without changing decision')
  await patch({ tileId: id, decision: null })
  const cleared = await (await fetch(base + '/api/run')).json()
  check('decision toggle preserves note', cleared.review.tiles[id].decision === null && cleared.review.tiles[id].note === 'Updated without changing decision')
  const traversal = await fetch(base + '/img/' + encodeURIComponent('../run.json'))
  check('image traversal rejected', traversal.status === 404)
  console.log(`${checks.length} live persistence checks passed`)
  writeFileSync('design-research/persistence-checks.json', JSON.stringify(checks, null, 2))
} finally { server.stop() }
