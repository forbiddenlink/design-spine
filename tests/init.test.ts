import { describe, expect, it } from 'vitest'
import { detectStartCommand, packageManagerFor } from '../src/lib/init.ts'

describe('packageManagerFor', () => {
  it.each([
    [['pnpm-lock.yaml'], 'pnpm'],
    [['bun.lock'], 'bun'],
    [['bun.lockb'], 'bun'],
    [['yarn.lock'], 'yarn'],
    [['package-lock.json'], 'npm'],
    [[], 'npm'],
    [['yarn.lock', 'pnpm-lock.yaml'], 'pnpm'],
  ])('%j -> %s', (files, expected) => {
    expect(packageManagerFor(files)).toBe(expected)
  })
})

describe('detectStartCommand', () => {
  it('prefers dev over start', () => {
    expect(detectStartCommand({ dev: 'next dev', start: 'next start' }, [])).toBe('npm run dev')
  })
  it('falls back to start', () => {
    expect(detectStartCommand({ start: 'next start' }, ['yarn.lock'])).toBe('yarn run start')
  })
  it('uses the lockfile manager', () => {
    expect(detectStartCommand({ dev: 'next dev' }, ['pnpm-lock.yaml'])).toBe('pnpm run dev')
    expect(detectStartCommand({ dev: 'next dev' }, ['bun.lock'])).toBe('bun run dev')
  })
  it('returns undefined without either script', () => {
    expect(detectStartCommand({ build: 'next build' }, [])).toBeUndefined()
    expect(detectStartCommand(undefined, [])).toBeUndefined()
  })
  it('ignores non-string scripts', () => {
    expect(detectStartCommand({ dev: 3, start: 'x' } as never, [])).toBe('npm run start')
  })
})
