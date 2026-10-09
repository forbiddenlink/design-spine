import { copyFileSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { writeJson } from '../../src/lib/runs.ts'

const out = 'design-research/field-validation'
const input = JSON.parse(readFileSync(join(out, 'yielding-short-soak-results.json'), 'utf8'))
const root = mkdtempSync(join(process.cwd(), out, '.design-spine/runs/cli-'))
const dir = join(root, '.design-spine/runs/current'), baselines = join(root, '.design-spine/baselines')
mkdirSync(dir, { recursive: true }); mkdirSync(baselines)
const run = JSON.parse(readFileSync(join(input.root, 'runs/current/run.json'), 'utf8'))
writeJson(join(dir, 'run.json'), run)
for (const tile of run.tiles) {
  copyFileSync(join(input.root, 'runs/current', tile.file), join(dir, tile.file))
  copyFileSync(join(input.root, 'baselines', tile.file), join(baselines, tile.file))
}
const before = performance.now(), label = process.argv[2] ?? 'before'
const child = Bun.spawn(['bun', resolve('src/cli.ts'), 'diff', '--run', dir], { cwd: root, env: { ...process.env, SPINE_CWD: root }, stdout: 'pipe', stderr: 'pipe' })
let peakSampledRssBytes = 0, sampling = false, cutoff = false
const timer = setInterval(async () => {
  if (sampling) return
  sampling = true
  try {
    const probe = Bun.spawn(['ps', '-o', 'rss=', '-p', String(child.pid)], { stdout: 'pipe', stderr: 'pipe' })
    const rss = Number((await new Response(probe.stdout).text()).trim()) * 1024
    await probe.exited
    if (Number.isFinite(rss)) peakSampledRssBytes = Math.max(peakSampledRssBytes, rss)
    if (rss > 2.5 * 1024 ** 3 && !cutoff) { cutoff = true; child.kill() }
  } finally { sampling = false }
}, 100)
const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
clearInterval(timer)
const result: any = { root, code, cutoff, peakSampledRssBytes, elapsedMs: performance.now() - before, stdout, stderr, passed: !cutoff && code === 1, scope: '240 identical generated long PNG pairs; child RSS sampled via ps every 100ms, not an exact allocation peak; other validation may run concurrently.' }
if (result.passed) {
  const actual = JSON.parse(readFileSync(join(dir, 'diff.json'), 'utf8'))
  result.rows = actual.rows
  result.passed &&= actual.rows.length === 240 && actual.rows.every((r: any) => ['ok', 'CHANGED'].includes(r.result))
  const reference = input.comparisons[0].digest
  result.evidenceMatches = reference.every((entry: any) => {
    const tile = run.tiles.find((t: any) => t.id === entry.id)
    const digest = createHash('sha256').update(readFileSync(join(dir, 'diff', tile.file))).digest('hex')
    const row = actual.rows.find((r: any) => r.id === entry.id)
    return digest === entry.hashes[1] && row.ratio === entry.ratio.toFixed(5)
  })
  result.passed &&= result.evidenceMatches
}
writeJson(join(out, `cli-scale-${label}.json`), result)
console.log(JSON.stringify({ label, code, cutoff, peakSampledRssBytes, elapsedMs: result.elapsedMs, passed: result.passed }))
if (!result.passed) process.exit(1)
