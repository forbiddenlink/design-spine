import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { PNG } from 'pngjs'
import { startReviewServer } from '../src/lib/server.ts'
import { writeJson } from '../src/lib/runs.ts'

mkdirSync('functional-review/evidence/.design-spine/runs', { recursive: true })
const root = mkdtempSync(join(process.cwd(), 'functional-review/evidence/.design-spine/runs/workflow-'))
const source = Bun.serve({ port: 0, fetch(req) {
  const url = new URL(req.url)
  return new Response(`<html><head><title>Owned audit fixture</title><style>body{margin:24px;font:18px system-ui} .blank{width:240px;height:120px;background:#ddd} @media(prefers-color-scheme:dark){body{background:#111;color:white}}</style></head><body data-seeded="${req.headers.get('cookie')?.includes('audit-session=generated') ? 'yes' : 'no'}"><h1>${url.pathname}</h1><p>${url.searchParams.has('empty') ? 'Empty state' : 'Generated audit content'}</p><div class="blank"></div><script>console.error('AUDIT:'+JSON.stringify({theme:localStorage.getItem('theme'),consent:localStorage.getItem('audit-consent'),seeded:document.body.dataset.seeded}))</script></body></html>`, { status: url.searchParams.has('error') ? 500 : 200, headers: { 'content-type': 'text/html' } })
} })
const records: { name: string; passed: boolean; details?: unknown }[] = []
const check = (name: string, passed: boolean, details?: unknown): void => { records.push({ name, passed, details }); if (!passed) throw new Error(name + ': ' + JSON.stringify(details)) }
async function command(args: string[], expected = 0): Promise<string> {
  const proc = Bun.spawn(['bun', resolve('src/cli.ts'), ...args], { cwd: root, env: { ...process.env, SPINE_CWD: root }, stdout: 'pipe', stderr: 'pipe' })
  const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited])
  check(args[0] + ': ' + args.slice(1).join(' '), code === expected, { code, out, err }); return out
}
let review: ReturnType<typeof startReviewServer> | undefined
try {
  const empty = JSON.parse(await command(['status'])); check('no-run status explicit', empty.lastRun === null && empty.tiles === 0)
  for (const file of ['page.tsx', 'about/page.tsx', 'blog/[slug]/page.tsx', '@modal/page.tsx', '(marketing)/pricing/page.tsx']) {
    const path = join(root, 'app', file); mkdirSync(join(path, '..'), { recursive: true }); writeFileSync(path, 'export default function Page(){return null}')
  }
  await command(['plan', '--base', `http://localhost:${source.port}`]); await command(['plan'], 2)
  const manifestPath = join(root, 'design-spine.json'); const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  check('plan includes grouped static and unresolved dynamic routes', manifest.routes.some((r: any) => r.path === '/pricing') && manifest.routes.some((r: any) => r.path === '/blog/[slug]') && !manifest.routes.some((r: any) => r.path.includes('@')))
  manifest.routes = manifest.routes.filter((r: any) => ['/', '/blog/[slug]'].includes(r.path))
  manifest.routes[0].states = [{ name: 'ideal' }, { name: 'empty', query: 'empty=1' }, { name: 'error', query: '?error=1' }, { name: 'loading', todo: true }]
  manifest.routes[1].params = { slug: 'generated' }; manifest.routes[1].states = [{ name: 'ideal' }]
  writeJson(join(root, 'generated-session.json'), { cookies: [{ name: 'audit-session', value: 'generated', domain: 'localhost', path: '/', expires: -1, httpOnly: true, secure: false, sameSite: 'Lax' }], origins: [] })
  manifest.routes[0].states[0].storageState = 'generated-session.json'
  manifest.initScripts = [{ localStorage: { 'audit-consent': 'generated' } }]
  writeJson(manifestPath, manifest)
  await command(['capture', '--base', `http://localhost:${source.port}`, '--concurrency', '3'])
  const dir = realpathSync(join(root, '.design-spine/latest')); const run = JSON.parse(readFileSync(join(dir, 'run.json'), 'utf8'))
  check('capture matrix complete, todo skipped', run.tiles.length === 16 && run.tiles.every((t: any) => !t.error && Bun.file(join(dir, t.file)).size > 0), run.tiles.map((t: any) => ({ id: t.id, error: t.error })))
  check('error state preserves HTTP diagnostic', run.tiles.filter((t: any) => t.state === 'error').every((t: any) => t.status === 500))
  check('theme and initialization reach isolated browser contexts', run.tiles.every((t: any) => { const proof = JSON.parse(t.consoleErrors.find((e: string) => e.startsWith('AUDIT:')).slice(6)); return proof.theme === t.theme && proof.consent === 'generated' }))
  check('saved session applies only to its selected state', run.tiles.every((t: any) => { const proof = JSON.parse(t.consoleErrors.find((e: string) => e.startsWith('AUDIT:')).slice(6)); return proof.seeded === (t.route === '/' && t.state === 'ideal' ? 'yes' : 'no') }))
  check('dynamic route filled', run.tiles.filter((t: any) => t.route.includes('slug')).every((t: any) => t.path === '/blog/generated'))
  review = startReviewServer(dir, 0); const base = `http://localhost:${review.port}`
  const tile = run.tiles[0]
  const response = await fetch(base + '/api/review', { method: 'POST', body: JSON.stringify({ tileId: tile.id, decision: 'approve', note: 'Approved generated fixture' }) })
  check('review decision persisted through API', response.ok && JSON.parse(readFileSync(join(dir, 'review.json'), 'utf8')).tiles[tile.id].note === 'Approved generated fixture')
  await command(['approve']); const baselines = join(root, '.design-spine/baselines')
  check('only selected approved tile promoted with provenance', Object.keys(JSON.parse(readFileSync(join(baselines, 'manifest.json'), 'utf8')).tiles).length === 1 && readFileSync(join(baselines, tile.file)).equals(readFileSync(join(dir, tile.file))))
  await command(['diff']); check('new tiles listed without inventing baseline', JSON.parse(readFileSync(join(dir, 'diff.json'), 'utf8')).rows.filter((r: any) => r.result === 'new').length === 15)
  const changed = PNG.sync.read(readFileSync(join(dir, tile.file)))
  for (let y = 0; y < 80; y++) for (let x = 0; x < 80; x++) { const i = (y * changed.width + x) * 4; changed.data[i] = 0; changed.data[i + 1] = 255; changed.data[i + 2] = 0 }
  writeFileSync(join(dir, tile.file), PNG.sync.write(changed)); await command(['diff'], 1)
  const stub = join(root, 'claude-stub'); writeFileSync(stub, '#!/usr/bin/env bun\nconsole.log(JSON.stringify({result:JSON.stringify({verdict:"pass",issues:[]})}))\n', { mode: 0o755 })
  await command(['critique', '--limit', '2', '--claude-bin', stub]); check('critique stub persisted only requested limit', Object.keys(JSON.parse(readFileSync(join(dir, 'critique.json'), 'utf8')).tiles).length === 2)
  await command(['critique', '--model', 'gpt-invalid', '--claude-bin', stub], 2)
  writeFileSync(stub, '#!/usr/bin/env bun\nconsole.error("generated provider failure");process.exit(1)\n')
  await command(['critique', '--limit', '1', '--claude-bin', stub]); check('provider failure retained per tile', JSON.parse(readFileSync(join(dir, 'critique.json'), 'utf8')).tiles[tile.id].verdict === 'error')
  const src = join(root, 'src'); mkdirSync(src); writeFileSync(join(src, 'page.tsx'), 'const classes="w-[12px]"')
  await command(['lint', '--update']); writeFileSync(join(src, 'page.tsx'), 'const classes="w-[12px] h-[24px]"')
  await command(['lint'], 1); await command(['lint', '--update'], 1)
  check('refused ratchet increase preserves baseline', JSON.parse(readFileSync(join(root, '.design-spine/lint-baseline.json'), 'utf8')).count === 1)
  const status = JSON.parse(await command(['status'])); check('status reflects captured persisted counts', status.tiles === 16 && status.approved === 1 && status.baselines === 1 && status.lintCount === 2 && status.lintBaseline === 1)
} finally { source.stop(); review?.stop(); writeJson('functional-review/evidence/workflow-checks.json', records) }
console.log(`${records.length} whole-workflow checks passed; generated root ${root}`)
