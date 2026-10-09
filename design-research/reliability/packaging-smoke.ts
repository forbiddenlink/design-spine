import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { PNG } from 'pngjs'
import { writeJson } from '../../src/lib/runs.ts'
const executable = resolve(process.argv[2])
const label = process.argv[3] || 'before'
const root = mkdtempSync(join(tmpdir(), 'spine-standalone-'))
const copiedExecutable = join(root, 'spine')
copyFileSync(executable, copiedExecutable)
const dir = join(root, '.design-spine/runs/demo')
mkdirSync(dir, { recursive: true }); mkdirSync(join(root, '.design-spine/baselines'), { recursive: true })
const png = new PNG({ width: 4, height: 4 }); png.data.fill(255)
const bytes = PNG.sync.write(png)
writeFileSync(join(dir, 'home.png'), bytes); writeFileSync(join(root, '.design-spine/baselines/home.png'), bytes)
writeJson(join(dir, 'run.json'), { id: 'package-smoke', tiles: [{ id: 'home', file: 'home.png', route: '/', path: '/', state: 'default', viewport: 390, theme: 'light', status: 200, consoleErrors: [], pageErrors: [], overflowX: false, blankRegions: { count: 0, boxes: [] }, brokenImages: [], textClipped: [] }] })
const checks: { name: string, passed: boolean }[] = []
const proc = Bun.spawn([copiedExecutable, 'review', '--run', dir, '--port', '0'], { cwd: root, stdout: 'pipe', stderr: 'pipe' })
let output = ''; const reader = proc.stdout.getReader()
const deadline = setTimeout(() => proc.kill(), 15000)
try {
 while (!output.match(/http:\/\/localhost:\d+/)) { const chunk = await reader.read(); if (chunk.done) throw new Error(output + await new Response(proc.stderr).text()); output += new TextDecoder().decode(chunk.value) }
 const base = output.match(/http:\/\/localhost:\d+/)![0]
 const html = await fetch(base); const content = await html.text()
 checks.push({ name: 'embedded viewer HTML', passed: html.ok && content.toLowerCase().includes('<!doctype html>') && content.includes('Design Spine') })
 const response = await fetch(base + '/api/run'); const body = await response.text(); if (!response.ok) throw new Error(`HTTP ${response.status}: ${body.slice(0, 200)}`); const data = JSON.parse(body)
 checks.push({ name: 'embedded worker and PNG dependencies', passed: response.ok && data.comparison.tiles.home.status === 'unchanged' })
 const image = await fetch(base + data.comparison.tiles.home.diffUrl)
 checks.push({ name: 'comparison image evidence', passed: image.ok && (await image.arrayBuffer()).byteLength > 0 })
 const saved = await fetch(base + '/api/review', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tileId: 'home', decision: 'approve', note: 'Synthetic standalone smoke' }) })
 checks.push({ name: 'synthetic review persisted', passed: saved.ok && JSON.parse(await Bun.file(join(dir, 'review.json')).text()).tiles.home.decision === 'approve' })
} catch (error) { checks.push({ name: String(error), passed: false }) }
finally { clearTimeout(deadline); proc.kill(); await proc.exited; writeJson(`design-research/reliability/packaging-${label}.json`, { executable, copiedExecutable, root, runtime: Bun.version, stderr: await new Response(proc.stderr).text(), checks, scope: 'Local macOS arm64 executable, outside checkout; no release or cross-platform claim.' }) }
console.log(checks)
if (checks.some(c => !c.passed)) process.exit(1)
