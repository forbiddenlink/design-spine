import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { PNG } from 'pngjs'
import { describe, expect, it } from 'vitest'

const root = mkdtempSync(join(tmpdir(), 'spine-cli-'))
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
function command(args: string[]): { status: number | null; text: string } {
  const result = spawnSync('bun', [cli, ...args], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, SPINE_CWD: root },
    timeout: 10000,
  })
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
