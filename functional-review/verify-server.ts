import { mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { startReviewServer } from '../src/lib/server.ts'
import { writeJson } from '../src/lib/runs.ts'

mkdirSync('functional-review/evidence/.design-spine/runs', { recursive: true })
const root = mkdtempSync(join(process.cwd(), 'functional-review/evidence/.design-spine/runs/server-'))
const dir = join(root, 'run'); mkdirSync(dir)
writeJson(join(dir, 'run.json'), { id: 'audit', tiles: [{ id: 'tile', file: 'valid.png' }, { id: 'linked', file: 'linked.png' }] })
writeFileSync(join(dir, 'valid.png'), 'generated public capture bytes')
writeFileSync(join(root, 'outside.png'), 'generated outside sentinel')
symlinkSync(join(root, 'outside.png'), join(dir, 'linked.png'))
let start = startReviewServer
if (process.argv.includes('--before')) {
  let code = spawnSync('git', ['show', 'HEAD:src/lib/server.ts'], { encoding: 'utf8' }).stdout
  code = code.replaceAll(/from '\.\/(.*?)'/g, (_match, path) => "from '" + resolve('src/lib', path) + "'")
  const oldPath = join(root, 'server-before.ts'); writeFileSync(oldPath, code)
  start = (await import(oldPath)).startReviewServer
}
const server = start(dir, 0)
const base = `http://localhost:${server.port}`
if (!process.argv.includes('--before')) writeJson('functional-review/evidence/server-runtime.json', { hostname: server.hostname, scope: 'generated local audit server; no remote requests performed' })
const checks: { name: string; passed: boolean; actual: unknown }[] = []
const check = (name: string, passed: boolean, actual: unknown): void => { checks.push({ name, passed, actual }) }
try {
  for (const [path, expected] of [['valid.png', 200], ['linked.png', 404], ['../outside.png', 404], ['%ZZ', 400]] as const) {
    const response = await fetch(`${base}/img/${path === '%ZZ' ? path : encodeURIComponent(path)}`)
    check(`image ${path}`, response.status === expected, response.status)
  }
  const post = async (data: unknown): Promise<Response> => fetch(`${base}/api/review`, { method: 'POST', body: JSON.stringify(data) })
  for (const body of [null, {}, { tileId: 'unknown' }, { tileId: 'tile', decision: 'yes' }]) {
    const response = await post(body); check('invalid review rejected', response.status === 400, response.status)
  }
  await post({ tileId: 'tile', note: 'generated audit note' })
  const approved = await (await post({ tileId: 'tile', decision: 'approve' })).json()
  check('decision preserves note', approved.note === 'generated audit note' && approved.decision === 'approve', approved)
  const clear = await (await post({ tileId: 'tile', decision: null })).json()
  check('toggle clears decision and preserves note', clear.note === approved.note && clear.decision === null, clear)
  const limited = await (await post({ tileId: 'tile', note: 'n'.repeat(2500) })).json()
  check('note limit matches editor', limited.note.length === 2000, limited.note.length)
  const data = await (await fetch(`${base}/api/run?compare=false`)).json()
  check('GET returns persisted review', data.review.tiles.tile.note === limited.note, data.review.tiles.tile.note.length)
  if (!process.argv.includes('--before')) {
    await Promise.all([post({ tileId: 'tile', note: 'Concurrent generated note' }), post({ tileId: 'tile', decision: 'reject' })])
    const concurrent = JSON.parse(readFileSync(join(dir, 'review.json'), 'utf8')).tiles.tile
    check('concurrent field patches both persist', concurrent.note === 'Concurrent generated note' && concurrent.decision === 'reject', concurrent)

    writeFileSync(join(dir, 'review.json'), '{generated corrupt review')
    const rejected = await post({ tileId: 'tile', note: 'must not overwrite' })
    check('corrupt review refuses save and preserves bytes', rejected.status === 503 && readFileSync(join(dir, 'review.json'), 'utf8') === '{generated corrupt review', rejected.status)
  }
} finally { server.stop() }
writeJson('functional-review/evidence/server' + (process.argv.includes('--before') ? '-before' : '') + '-checks.json', checks)
console.log(JSON.stringify(checks))
if (checks.some(check => !check.passed)) process.exit(1)
