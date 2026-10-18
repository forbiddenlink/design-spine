import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  DOCKER_BUN_VERSION,
  dockerfileText,
  dockerRunArgv,
  imageTag,
  innerCaptureArgs,
  installedPlaywrightVersion,
  locateCli,
  manifestInRoot,
  rewriteBaseForDocker,
} from '../src/lib/docker'

describe('docker image', () => {
  it('tags by playwright and bun version', () => {
    expect(imageTag('1.63.0')).toBe(`design-spine-capture:1.63.0-bun${DOCKER_BUN_VERSION}`)
  })
  it('builds from the matching playwright image and copies bun in', () => {
    expect(dockerfileText('1.63.0', '1.3.13')).toBe(
      'FROM mcr.microsoft.com/playwright:v1.63.0-noble\nCOPY --from=oven/bun:1.3.13 /usr/local/bin/bun /usr/local/bin/bun\n',
    )
  })
  it('pins the same bun as package.json engines and action.yml', () => {
    const engines = JSON.parse(readFileSync('package.json', 'utf8')).engines.bun
    expect(engines).toBe(`>=${DOCKER_BUN_VERSION}`)
    expect(readFileSync('action.yml', 'utf8')).toContain(`bun-version: ${DOCKER_BUN_VERSION}`)
  })
  it('reads the installed playwright version', () => {
    expect(installedPlaywrightVersion()).toMatch(/^\d+\.\d+\.\d+/)
  })
})

describe('rewriteBaseForDocker', () => {
  it.each([
    ['http://localhost:3000', 'http://host.docker.internal:3000'],
    ['http://127.0.0.1:4010/', 'http://host.docker.internal:4010/'],
    ['https://localhost/app?x=1', 'https://host.docker.internal/app?x=1'],
    ['http://[::1]:8080', 'http://host.docker.internal:8080'],
  ])('%s -> %s', (from, to) => expect(rewriteBaseForDocker(from)).toBe(to))
  it('leaves other hosts alone', () => {
    expect(rewriteBaseForDocker('https://staging.example.com')).toBe('https://staging.example.com')
    expect(rewriteBaseForDocker('http://localhost.example.com:3000')).toBe(
      'http://localhost.example.com:3000',
    )
  })
})

describe('cli location', () => {
  it('uses a path under /work when the cli is inside the project', () => {
    expect(
      locateCli('/p', '/p/node_modules/design-spine/src/cli.ts', '/p/node_modules/design-spine'),
    ).toEqual({ mounts: [], path: '/work/node_modules/design-spine/src/cli.ts' })
  })
  it('mounts the package read-only when the cli is outside the project', () => {
    expect(locateCli('/p', '/dev/design-spine/src/cli.ts', '/dev/design-spine')).toEqual({
      mounts: ['-v', '/dev/design-spine:/spine:ro'],
      path: '/spine/src/cli.ts',
    })
  })
  it('does not treat a sibling with a shared prefix as inside the root', () => {
    expect(locateCli('/p', '/p-other/src/cli.ts', '/p-other').path).toBe('/spine/src/cli.ts')
  })
})

describe('run argv', () => {
  const inner = innerCaptureArgs({
    manifest: 'design-spine.json',
    base: 'http://host.docker.internal:4010',
    concurrency: '3',
  })
  it('forwards only supplied options', () => {
    expect(inner).toEqual([
      'capture',
      '--manifest',
      'design-spine.json',
      '--base',
      'http://host.docker.internal:4010',
      '--concurrency',
      '3',
    ])
    expect(
      innerCaptureArgs({ manifest: 'm.json', base: 'b', routes: '/a,/b', concurrency: '1' }),
    ).toContain('/a,/b')
  })
  it('runs amd64 with the host mapping, env passthrough and the cli path', () => {
    const argv = dockerRunArgv({
      image: 'img:1',
      root: '/p',
      cli: { mounts: ['-v', '/d:/spine:ro'], path: '/spine/src/cli.ts' },
      recordedBase: 'http://localhost:4010',
      inner,
    })
    expect(argv.slice(0, 6)).toEqual([
      'run',
      '--rm',
      '--platform',
      'linux/amd64',
      '--init',
      '--ipc=host',
    ])
    expect(argv).toContain('--add-host=host.docker.internal:host-gateway')
    expect(argv).toContain('SPINE_CWD=/work')
    expect(argv).toContain('PLAYWRIGHT_BROWSERS_PATH=/ms-playwright')
    expect(argv).toContain('SPINE_RECORDED_BASE_URL=http://localhost:4010')
    expect(argv.join(' ')).toContain('-v /p:/work -v /d:/spine:ro -w /work')
    expect(argv.slice(argv.indexOf('img:1'))).toEqual([
      'img:1',
      'bun',
      '/spine/src/cli.ts',
      ...inner,
    ])
    expect(argv).not.toContain('--user')
  })
  it('keeps file ownership with the caller on Linux hosts', () => {
    const argv = dockerRunArgv({
      image: 'i',
      root: '/p',
      cli: { mounts: [], path: '/work/x' },
      recordedBase: 'b',
      inner,
      user: { uid: 1000, gid: 1001 },
    })
    expect(argv).toContain('1000:1001')
    expect(argv).toContain('HOME=/tmp')
  })
})

describe('manifestInRoot', () => {
  it('returns a root-relative posix path', () => {
    expect(manifestInRoot('/p', 'design-spine.json')).toBe('design-spine.json')
    expect(manifestInRoot('/p', '/p/conf/m.json')).toBe('conf/m.json')
  })
  it('rejects a manifest outside the root', () => {
    expect(() => manifestInRoot('/p', '../m.json')).toThrow('inside the project root')
  })
})
