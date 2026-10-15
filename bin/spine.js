#!/usr/bin/env node
// Thin launcher: Design Spine needs Bun (HTML imports, Bun.serve), so hand off to it.
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const MESSAGE = 'Design Spine runs on Bun 1.3+. Install: curl -fsSL https://bun.sh/install | bash'
const cli = fileURLToPath(new URL('../src/cli.ts', import.meta.url))
const version = spawnSync('bun', ['--version'], { encoding: 'utf8' })
const [major = 0, minor = 0] = (version.stdout ?? '').trim().split('.').map(Number)
if (version.error || version.status !== 0 || major < 1 || (major === 1 && minor < 3)) {
  console.error(MESSAGE)
  process.exit(1)
}
const result = spawnSync('bun', [cli, ...process.argv.slice(2)], { stdio: 'inherit' })
process.exit(result.status ?? 1)
