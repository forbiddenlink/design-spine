#!/usr/bin/env node
// Thin launcher: Design Spine needs Bun (HTML imports, Bun.serve), so hand off to it.
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { resolveBun } from './resolve-bun.js'

const MESSAGE = 'Design Spine runs on Bun 1.3+. Install: curl -fsSL https://bun.sh/install | bash'
const cli = fileURLToPath(new URL('../src/cli.ts', import.meta.url))
const bun = resolveBun()
if (!bun) {
  console.error(MESSAGE)
  process.exit(1)
}
const child = spawn(bun, [cli, ...process.argv.slice(2)], { stdio: 'inherit' })
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, () => child.kill(signal))
child.on('error', () => {
  console.error(MESSAGE)
  process.exit(1)
})
child.on('exit', (code, signal) => {
  if (signal) {
    process.removeAllListeners(signal)
    process.kill(process.pid, signal)
  } else {
    process.exit(code ?? 1)
  }
})
