// Finds a Bun >= 1.3.13: one on PATH first, else the binary from the bundled @oven/bun-<platform> package.
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

export const MIN_MAJOR = 1
export const MIN_MINOR = 3
const MIN_PATCH = 13

export function satisfiesMinimum(versionText) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:\+[0-9A-Za-z.-]+)?$/.exec(String(versionText).trim())
  if (!match) return false
  const [major, minor, patch] = match.slice(1).map(Number)
  if (major !== MIN_MAJOR) return major > MIN_MAJOR
  if (minor !== MIN_MINOR) return minor > MIN_MINOR
  return patch >= MIN_PATCH
}

// Maps node's platform/arch to the @oven/bun-* package that holds the real binary.
export function platformPackage({ platform, arch, musl = false }) {
  const cpu = { x64: 'x64', arm64: 'aarch64' }[arch]
  const os = { darwin: 'darwin', linux: 'linux', win32: 'windows' }[platform]
  if (!cpu || !os) return undefined
  return `@oven/bun-${os}-${cpu}${os === 'linux' && musl ? '-musl' : ''}`
}

function isMusl() {
  if (process.platform !== 'linux') return false
  try {
    return !process.report.getReport().header.glibcVersionRuntime
  } catch {
    return false
  }
}

// Oven's `bun` package ships a stub bin until its postinstall runs, which pnpm 12 and
// --ignore-scripts skip, and pnpm 12 fails the whole install over that script. So we depend on
// the script-free platform packages directly; they carry the real binary.
export function bundledBunPath({
  platform = process.platform,
  arch = process.arch,
  musl = isMusl(),
  resolve = createRequire(import.meta.url).resolve,
  exists = existsSync,
} = {}) {
  const name = platformPackage({ platform, arch, musl })
  if (!name) return undefined
  try {
    const pkgDir = dirname(resolve(`${name}/package.json`))
    const file = join(pkgDir, 'bin', platform === 'win32' ? 'bun.exe' : 'bun')
    return exists(file) ? file : undefined
  } catch {
    return undefined
  }
}

function bunVersion(command, run) {
  const result = run(command, ['--version'], { encoding: 'utf8', timeout: 10000 })
  if (result.error || result.status !== 0) return undefined
  return result.stdout ?? ''
}

// Returns the command to run Bun with, or undefined when no usable Bun exists.
export function resolveBun({ run = spawnSync, bundled = bundledBunPath } = {}) {
  const onPath = bunVersion('bun', run)
  if (onPath !== undefined && satisfiesMinimum(onPath)) return 'bun'
  const file = bundled()
  if (file && satisfiesMinimum(bunVersion(file, run) ?? '')) return file
  return undefined
}
