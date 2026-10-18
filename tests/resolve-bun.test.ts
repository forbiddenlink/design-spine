import { describe, expect, it } from 'vitest'
import {
  bundledBunPath,
  platformPackage,
  resolveBun,
  satisfiesMinimum,
} from '../bin/resolve-bun.js'

const ok = (stdout: string) => ({ status: 0, stdout })
const fail = { status: null, error: new Error('ENOENT') }

describe('satisfiesMinimum', () => {
  it('accepts 1.3 and later, rejects older', () => {
    expect(satisfiesMinimum('1.3.0\n')).toBe(true)
    expect(satisfiesMinimum('1.4.2')).toBe(true)
    expect(satisfiesMinimum('2.0.0')).toBe(true)
    expect(satisfiesMinimum('1.2.9')).toBe(false)
    expect(satisfiesMinimum('')).toBe(false)
  })
})

describe('platformPackage', () => {
  it('maps node platform and arch to the oven package', () => {
    expect(platformPackage({ platform: 'darwin', arch: 'arm64' })).toBe('@oven/bun-darwin-aarch64')
    expect(platformPackage({ platform: 'linux', arch: 'x64' })).toBe('@oven/bun-linux-x64')
    expect(platformPackage({ platform: 'linux', arch: 'x64', musl: true })).toBe(
      '@oven/bun-linux-x64-musl',
    )
    expect(platformPackage({ platform: 'win32', arch: 'x64' })).toBe('@oven/bun-windows-x64')
    expect(platformPackage({ platform: 'sunos', arch: 'x64' })).toBeUndefined()
  })
})

describe('bundledBunPath', () => {
  it('points at the binary inside the platform package', () => {
    const resolve = (id: string) => `/n/${id}`
    expect(bundledBunPath({ platform: 'darwin', arch: 'arm64', resolve, exists: () => true })).toBe(
      '/n/@oven/bun-darwin-aarch64/bin/bun',
    )
    expect(bundledBunPath({ platform: 'win32', arch: 'x64', resolve, exists: () => true })).toBe(
      '/n/@oven/bun-windows-x64/bin/bun.exe',
    )
  })

  it('returns undefined when the package is not installed', () => {
    const resolve = () => {
      throw new Error('not found')
    }
    expect(bundledBunPath({ platform: 'darwin', arch: 'arm64', resolve })).toBeUndefined()
  })

  it('returns undefined when the binary file is missing', () => {
    const resolve = () => '/x/node_modules/bun/package.json'
    expect(
      bundledBunPath({ platform: 'darwin', arch: 'arm64', resolve, exists: () => false }),
    ).toBeUndefined()
  })
})

describe('resolveBun', () => {
  it('prefers a qualifying bun on PATH', () => {
    const run = (command: string) => (command === 'bun' ? ok('1.3.13') : fail)
    expect(resolveBun({ run, bundled: () => '/bundled/bun' })).toBe('bun')
  })

  it('falls back to the bundled binary when PATH has none', () => {
    const run = (command: string) => (command === '/bundled/bun' ? ok('1.4.2') : fail)
    expect(resolveBun({ run, bundled: () => '/bundled/bun' })).toBe('/bundled/bun')
  })

  it('falls back when the PATH bun is too old', () => {
    const run = (command: string) => ok(command === 'bun' ? '1.2.0' : '1.4.2')
    expect(resolveBun({ run, bundled: () => '/bundled/bun' })).toBe('/bundled/bun')
  })

  it('returns undefined when nothing qualifies', () => {
    expect(resolveBun({ run: () => fail, bundled: () => undefined })).toBeUndefined()
    expect(resolveBun({ run: () => ok('1.2.0'), bundled: () => '/b' })).toBeUndefined()
  })
})
