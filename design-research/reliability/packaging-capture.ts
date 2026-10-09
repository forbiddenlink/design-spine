import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { writeJson } from '../../src/lib/runs.ts'
const executable = JSON.parse(await Bun.file('design-research/reliability/packaging-outside.json').text()).copiedExecutable
const root = mkdtempSync(join(tmpdir(), 'spine-standalone-capture-'))
const site = Bun.serve({ port: 0, fetch: () => new Response('<!doctype html><html lang="en"><title>Synthetic capture</title><body><h1>Generated packaging check</h1><p>No user data.</p></body></html>', { headers: { 'content-type': 'text/html' } }) })
writeJson(join(root, 'design-spine.json'), { baseUrl: 'http://localhost:' + site.port, viewports: [390], themes: { light: 'light', dark: 'dark', method: 'class', className: 'dark' }, routes: [{ path: '/', states: [{ name: 'default' }] }] })
const proc = Bun.spawn([executable, 'capture', '--base', 'http://localhost:' + site.port], { cwd: root, stdout: 'pipe', stderr: 'pipe', env: { ...process.env, SPINE_CWD: root } })
const timeout = setTimeout(() => proc.kill(), 20000)
try {
 const [stdout, stderr, status] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited])
 writeJson('design-research/reliability/packaging-capture.json', { root, status, stdout, stderr, scope: 'Compiled capture against generated local HTML, with installed Chromium; no public or confidential app access.' })
 console.log({ status, stdout, stderr: stderr.slice(0,1000) })
 if (status !== 0) process.exitCode = 1
} finally { clearTimeout(timeout); site.stop(true) }
