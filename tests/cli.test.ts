import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { PNG } from 'pngjs'
import { afterAll, describe, expect, it } from 'vitest'

const root = mkdtempSync(join(tmpdir(), 'spine-cli-'))
afterAll(() => rmSync(root, { recursive: true, force: true }))
const run = join(root, '.design-spine/runs/audit')
const baselines = join(root, '.design-spine/baselines')
mkdirSync(run, { recursive: true })
mkdirSync(baselines, { recursive: true })
const image = (color: number): Buffer => {
  const png = new PNG({ width: 4, height: 4 })
  png.data.fill(color)
  for (let i = 3; i < png.data.length; i += 4) png.data[i] = 255
  return PNG.sync.write(png)
}
writeFileSync(join(run, 'tile.png'), image(0))
writeFileSync(join(baselines, 'tile.png'), image(255))
writeFileSync(
  join(run, 'run.json'),
  JSON.stringify({ id: 'audit', tiles: [{ id: 'tile', file: 'tile.png' }] }),
)
const cli = resolve('src/cli.ts')
function command(args: string[], cwd = root): { status: number | null; text: string } {
  const result = spawnSync(
    process.env.SPINE_CLI_BIN ? resolve(process.env.SPINE_CLI_BIN) : 'bun',
    process.env.SPINE_CLI_BIN ? args : [cli, ...args],
    {
      cwd,
      encoding: 'utf8',
      env: { ...process.env, SPINE_CWD: cwd },
      timeout: 10000,
    },
  )
  return { status: result.status, text: result.stdout + result.stderr }
}

describe('CLI input contracts', () => {
  it.each(['NaN', 'Infinity', '-1', '1.1', 'oops'])(
    'rejects invalid diff threshold %s before writing results',
    (value) => {
      const result = command(['diff', '--run', run, '--threshold', value])
      expect(result.status).toBe(2)
      expect(result.text).toContain('threshold')
    },
  )
  it('uses zero and one as valid threshold boundaries', () => {
    expect(command(['diff', '--run', run, '--threshold', '0']).status).toBe(1)
    expect(command(['diff', '--run', run, '--threshold', '1']).status).toBe(0)
    expect(JSON.parse(readFileSync(join(run, 'diff.json'), 'utf8')).threshold).toBe(1)
  })
  it.each(['0', '-1', '1.5', 'Infinity', 'oops'])(
    'rejects invalid concurrency %s before attempting capture',
    (value) => {
      const result = command(['capture', '--base', 'http://localhost:1', '--concurrency', value])
      expect(result.status).toBe(2)
      expect(result.text).toContain('concurrency')
    },
  )
  it.each(['0', '-1', '1.5', 'oops'])(
    'rejects invalid critique limit %s before invoking Claude',
    (value) => {
      const result = command(['critique', '--run', run, '--limit', value])
      expect(result.status).toBe(2)
      expect(result.text).toContain('limit')
    },
  )
  it.each(['-1', '65536', '1.5', 'oops'])(
    'rejects invalid review port %s before serving',
    (value) => {
      const result = command(['review', '--run', run, '--port', value])
      expect(result.status).toBe(2)
      expect(result.text).toContain('port')
    },
  )
})

describe('coverage-aware commands', () => {
  it('doctor rejects unfinished coverage and accepts a complete manifest', () => {
    const manifest = {
      baseUrl: 'http://localhost:3000',
      viewports: [390],
      themes: { light: 'light', dark: 'dark', method: 'media' },
      routes: [{ path: '/', states: [{ name: 'ideal', todo: true }] }],
    }
    const path = join(root, 'doctor.json')
    writeFileSync(path, JSON.stringify(manifest))
    expect(command(['doctor', '--manifest', path]).status).toBe(1)
    const ideal = manifest.routes[0]?.states[0]
    if (!ideal) throw new Error('Missing fixture state')
    ideal.todo = false
    writeFileSync(path, JSON.stringify(manifest))
    expect(command(['doctor', '--manifest', path]).status).toBe(0)
  })
  it('keeps pixel-only compatibility while strict mode refuses unknown, skipped and pending evidence', () => {
    const dir = join(root, '.design-spine/runs/strict')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'strict.png'), image(0))
    writeFileSync(join(baselines, 'strict.png'), image(0))
    const provenance = { browser: 'test', runtime: 'test', platform: 'test', policy: {} }
    const record = {
      id: 'strict',
      tiles: [
        {
          id: 'strict',
          file: 'strict.png',
          imageHash: createHash('sha256').update(image(0)).digest('hex'),
          recipeHash: 'a'.repeat(64),
        },
      ],
      provenance,
      coverage: [{ id: 'strict', outcome: 'captured' }],
    }
    const save = () => writeFileSync(join(dir, 'run.json'), JSON.stringify(record))
    writeFileSync(
      join(baselines, 'manifest.json'),
      JSON.stringify({ tiles: { strict: { provenance, recipeHash: 'a'.repeat(64) } } }),
    )
    writeFileSync(
      join(dir, 'review.json'),
      JSON.stringify({ tiles: { strict: { decision: 'approve', note: '' } } }),
    )
    save()
    expect(command(['diff', '--run', dir, '--strict']).status).toBe(0)
    writeFileSync(join(dir, 'strict.png'), image(255))
    expect(command(['diff', '--run', dir, '--threshold', '1', '--strict']).status).toBe(1)
    writeFileSync(join(dir, 'strict.png'), image(0))
    record.coverage = []
    save()
    expect(command(['diff', '--run', dir]).status).toBe(0)
    expect(command(['diff', '--run', dir, '--strict']).status).toBe(1)
    record.coverage = [
      { id: 'strict', outcome: 'captured' },
      { id: 'missing', outcome: 'skipped' },
    ]
    save()
    expect(command(['diff', '--run', dir, '--strict']).status).toBe(1)
    record.coverage.pop()
    save()
    writeFileSync(join(dir, 'review.json'), JSON.stringify({ tiles: {} }))
    expect(command(['diff', '--run', dir, '--strict']).status).toBe(1)
  })
})

it('preflights every approved image before changing any baseline', () => {
  const dir = join(root, '.design-spine/runs/promotion')
  mkdirSync(dir, { recursive: true })
  const old = image(255),
    next = image(0)
  for (const file of ['one.png', 'two.png']) {
    writeFileSync(join(dir, file), next)
    writeFileSync(join(baselines, file), old)
  }
  const firstHash = createHash('sha256').update(next).digest('hex')
  writeFileSync(
    join(dir, 'run.json'),
    JSON.stringify({
      id: 'promotion',
      tiles: [
        { id: 'one', file: 'one.png', imageHash: firstHash },
        { id: 'two', file: 'two.png', imageHash: 'a'.repeat(64) },
      ],
    }),
  )
  writeFileSync(
    join(dir, 'review.json'),
    JSON.stringify({
      tiles: { one: { decision: 'approve', note: '' }, two: { decision: 'approve', note: '' } },
    }),
  )
  const manifest = JSON.stringify({ tiles: { one: { run: 'old' }, two: { run: 'old' } } })
  writeFileSync(join(baselines, 'manifest.json'), manifest)
  expect(command(['approve', '--run', dir]).status).toBe(2)
  expect(readFileSync(join(baselines, 'one.png')).equals(old)).toBe(true)
  expect(readFileSync(join(baselines, 'two.png')).equals(old)).toBe(true)
  expect(readFileSync(join(baselines, 'manifest.json'), 'utf8')).toBe(manifest)
})

const project = (files: Record<string, string>): string => {
  const dir = mkdtempSync(join(tmpdir(), 'spine-cli-project-'))
  afterAll(() => rmSync(dir, { recursive: true, force: true }))
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(join(dir, path, '..'), { recursive: true })
    writeFileSync(join(dir, path), body)
  }
  return dir
}
const page = 'export default function P(){return null}'

describe('first-run ergonomics', () => {
  it('plan writes ideal-only static routes, loading/error where files exist, and --all-states restores the rest', () => {
    const dir = project({
      'app/page.tsx': page,
      'app/dash/page.tsx': page,
      'app/dash/loading.tsx': page,
      'app/a-b/page.tsx': page,
      'app/a/b/page.tsx': page,
    })
    const result = command(['plan'], dir)
    expect(result.status).toBe(0)
    expect(result.text).toContain('Slug collision: /a-b and /a/b')
    const states = (): Record<string, string[]> =>
      Object.fromEntries(
        JSON.parse(readFileSync(join(dir, 'design-spine.json'), 'utf8')).routes.map(
          (r: { path: string; states: { name: string }[] }) => [
            r.path,
            r.states.map((s) => s.name),
          ],
        ),
      )
    expect(states()['/']).toEqual(['ideal'])
    expect(states()['/dash']).toEqual(['ideal', 'loading'])
    expect(command(['plan', '--all-states', '--force'], dir).status).toBe(0)
    expect(states()['/']).toEqual(['ideal', 'empty', 'loading', 'error'])
  })
  it('plan says the pages router is unsupported', () => {
    const result = command(['plan'], project({ 'pages/index.tsx': page }))
    expect(result.status).toBe(2)
    expect(result.text).toContain('pages router is not supported')
  })
  it('doctor groups unfinished tiles per route and state, with --verbose for every tile', () => {
    const dir = project({
      'design-spine.json': JSON.stringify({
        baseUrl: 'http://localhost:3000',
        viewports: [390, 1280],
        themes: { light: 'light', dark: 'dark', method: 'media' },
        routes: [{ path: '/', states: [{ name: 'ideal' }, { name: 'loading', todo: true }] }],
      }),
    })
    const grouped = command(['doctor'], dir)
    expect(grouped.status).toBe(1)
    expect(grouped.text).toContain('/ · loading (4 tiles)')
    expect(grouped.text.split('\n').filter((l) => l.includes('__loading__'))).toHaveLength(0)
    const verbose = command(['doctor', '--verbose'], dir)
    expect(verbose.status).toBe(1)
    expect(verbose.text.split('\n').filter((l) => l.includes('__loading__'))).toHaveLength(4)
  })
  it('capture falls back to the manifest baseUrl, exits 1 after writing the run when tiles error', () => {
    const dir = project({
      'design-spine.json': JSON.stringify({
        baseUrl: 'http://127.0.0.1:1',
        viewports: [390],
        themes: { light: 'light', dark: 'dark', method: 'media' },
        routes: [{ path: '/', states: [{ name: 'ideal' }] }],
      }),
    })
    const result = command(['capture', '--concurrency', '2'], dir)
    expect(result.status).toBe(1)
    expect(result.text).toContain('2 of 2 tiles failed to capture')
    expect(
      readFileSync(
        join(
          dir,
          '.design-spine/runs',
          readdirSync(join(dir, '.design-spine/runs'))[0] as string,
          'run.json',
        ),
        'utf8',
      ),
    ).toContain('"error"')
  })
  it('capture errors clearly when there is no base URL anywhere', () => {
    const dir = project({ 'design-spine.json': JSON.stringify({ routes: [] }) })
    const result = command(['capture'], dir)
    expect(result.status).toBe(2)
    expect(result.text).toContain('No base URL')
  })
  it('report refuses to overwrite unless --force', () => {
    const out = join(root, 'report.html')
    expect(command(['report', '--run', run, '--out', out]).status).toBe(0)
    expect(command(['report', '--run', run, '--out', out]).text).toContain('--force')
    expect(command(['report', '--run', run, '--out', out]).status).toBe(2)
    expect(command(['report', '--run', run, '--out', out, '--force']).status).toBe(0)
  })
  it('non-strict diff warns about tiles without a baseline', () => {
    const dir = join(root, '.design-spine/runs/fresh')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'fresh-tile.png'), image(0))
    writeFileSync(
      join(dir, 'run.json'),
      JSON.stringify({ id: 'fresh', tiles: [{ id: 'fresh-tile', file: 'fresh-tile.png' }] }),
    )
    const result = command(['diff', '--run', dir])
    expect(result.status).toBe(0)
    expect(result.text).toContain('1 tiles have no baseline. Run `spine approve` after review')
  })
  it('lint and status default to app when there is no src', () => {
    const dir = project({ 'app/x.tsx': 'export const x = <div className="p-[13px]" />' })
    expect(command(['lint'], dir).text).toContain('Arbitrary values: 1')
    expect(JSON.parse(command(['status'], dir).text).lintCount).toBe(1)
  })
})

describe('fail-closed state files', () => {
  it('lint refuses a corrupt baseline instead of treating it as missing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'spine-lint-'))
    mkdirSync(join(dir, 'src'), { recursive: true })
    mkdirSync(join(dir, '.design-spine'), { recursive: true })
    writeFileSync(join(dir, 'src/a.tsx'), '<div className="p-[3px] m-[5px]" />\n')
    const lint = (args: string[]) =>
      spawnSync('bun', [cli, 'lint', ...args], {
        cwd: dir,
        encoding: 'utf8',
        env: { ...process.env, SPINE_CWD: dir },
        timeout: 10000,
      })
    for (const bad of ['{"count":', '{}', '{"count":"2"}']) {
      writeFileSync(join(dir, '.design-spine/lint-baseline.json'), bad)
      const result = lint([])
      expect(result.status).toBe(2)
      expect(result.stdout + result.stderr).toContain('lint-baseline.json')
      expect(readFileSync(join(dir, '.design-spine/lint-baseline.json'), 'utf8')).toBe(bad)
    }
    rmSync(dir, { recursive: true, force: true })
  })
  it('approve preserves an unreadable baseline manifest', () => {
    const dir = join(root, '.design-spine/runs/corrupt-manifest')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'cm.png'), image(0))
    writeFileSync(
      join(dir, 'run.json'),
      JSON.stringify({ id: 'corrupt-manifest', tiles: [{ id: 'cm', file: 'cm.png' }] }),
    )
    writeFileSync(
      join(dir, 'review.json'),
      JSON.stringify({ tiles: { cm: { decision: 'approve', note: '' } } }),
    )
    writeFileSync(join(baselines, 'manifest.json'), '{"tiles":{"other":')
    const result = command(['approve', '--run', dir])
    expect(result.status).toBe(2)
    expect(result.text).toContain('manifest.json')
    expect(readFileSync(join(baselines, 'manifest.json'), 'utf8')).toBe('{"tiles":{"other":')
    rmSync(join(baselines, 'manifest.json'))
  })
})

describe('run record containment', () => {
  it.each(['../../escaped.png', '/tmp/escaped.png', 'sub/dir.png', 'tile.txt'])(
    'refuses a run.json tile file %s',
    (file) => {
      const dir = join(root, '.design-spine/runs/escape')
      mkdirSync(dir, { recursive: true })
      writeFileSync(
        join(dir, 'run.json'),
        JSON.stringify({ id: 'escape', tiles: [{ id: 't', file }] }),
      )
      writeFileSync(
        join(dir, 'review.json'),
        JSON.stringify({ tiles: { t: { decision: 'approve', note: '' } } }),
      )
      const result = command(['approve', '--run', dir])
      expect(result.status).toBe(2)
      expect(result.text).toContain('run.json')
    },
  )
})

describe('CLI exit codes and outputs', () => {
  it('maps usage errors to exit 2 so they differ from unfinished coverage', () => {
    expect(command(['doctor', '--bogus']).status).toBe(2)
    expect(command(['--help']).status).toBe(0)
  })
  it('report refuses to write through a dangling symlink', () => {
    const target = join(root, 'symlink-target.html')
    const link = join(root, 'report-link.html')
    symlinkSync(target, link)
    const result = command(['report', '--run', run, '--out', link])
    expect(result.status).toBe(2)
    expect(existsSync(target)).toBe(false)
  })
})

it('critique kills a hung claude process at the timeout and records an error', () => {
  const dir = join(root, '.design-spine/runs/hung')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'hung.png'), image(0))
  writeFileSync(
    join(dir, 'run.json'),
    JSON.stringify({ id: 'hung', tiles: [{ id: 'hung', file: 'hung.png' }] }),
  )
  const bin = join(root, 'fake-claude.sh')
  writeFileSync(bin, '#!/bin/sh\nsleep 30\n', { mode: 0o755 })
  const started = Date.now()
  const result = command(['critique', '--run', dir, '--claude-bin', bin, '--timeout', '1'])
  expect(result.status).toBe(0)
  expect(Date.now() - started).toBeLessThan(8000)
  const critique = JSON.parse(readFileSync(join(dir, 'critique.json'), 'utf8'))
  expect(critique.tiles.hung.verdict).toBe('error')
  expect(critique.tiles.hung.error).toContain('timed out')
})
