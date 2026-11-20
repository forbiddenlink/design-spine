import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

const yml = readFileSync('action.yml', 'utf8')

/** The `run: |` body of one composite step, dedented. */
function stepScript(name: string): string {
  const lines = yml.split('\n')
  const start = lines.findIndex((line) => line.trim() === `- name: ${name}`)
  if (start < 0) throw new Error(`No step named ${name}`)
  const run = lines.findIndex((line, i) => i > start && line.trim() === 'run: |')
  const body: string[] = []
  for (const line of lines.slice(run + 1)) {
    if (line.trim() && !line.startsWith('        ')) break
    body.push(line.slice(8))
  }
  return body.join('\n')
}

const root = mkdtempSync(join(tmpdir(), 'spine-status-'))
afterAll(() => rmSync(root, { recursive: true, force: true }))

type Row = { id: string; result: string }
interface Options {
  outcome: string
  rows?: Row[]
  suffix?: string
  sha?: string
  ghFails?: boolean
}

describe('action commit status', () => {
  const script = stepScript('Set commit status')

  /** Runs the step against a fake `gh` that records its arguments instead of calling GitHub. */
  function post(opts: Options) {
    const dir = mkdtempSync(join(root, 'run-'))
    mkdirSync(join(dir, '.design-spine', 'latest'), { recursive: true })
    if (opts.rows) {
      writeFileSync(
        join(dir, '.design-spine', 'latest', 'diff.json'),
        JSON.stringify({ rows: opts.rows }),
      )
    }
    const log = join(dir, 'gh.log')
    const mock = 'gh() { printf "%s\\n" "$@" > "$GH_LOG"; return "$GH_EXIT"; }'
    const result = spawnSync('bash', ['-e', '-c', `${mock}\n${script}`], {
      cwd: dir,
      env: {
        ...process.env,
        GH_LOG: log,
        GH_EXIT: opts.ghFails ? '1' : '0',
        DIFF_OUTCOME: opts.outcome,
        SPINE_NAME_SUFFIX: opts.suffix ?? '',
        STATUS_SHA: opts.sha ?? 'abc123',
        GITHUB_REPOSITORY: 'o/r',
        GITHUB_SERVER_URL: 'https://github.com',
        GITHUB_RUN_ID: '42',
        GH_TOKEN: 'x',
      },
      encoding: 'utf8',
    })
    const args = existsSync(log) ? readFileSync(log, 'utf8').split('\n') : []
    expect(args, result.stderr || result.stdout).not.toHaveLength(0)
    const field = (key: string) => args.find((a) => a.startsWith(`${key}=`))?.slice(key.length + 1)
    return {
      result,
      args,
      state: field('state'),
      description: field('description'),
      context: field('context'),
      url: field('target_url'),
    }
  }

  it('declares an opt-in commit-status input that defaults to false', () => {
    expect(yml).toMatch(
      /\n {2}commit-status:\n(?: {4}.*\n)*? {4}required: false\n {4}default: "false"\n/,
    )
  })

  it('runs only when opted in, always, and never fails the job', () => {
    const start = yml.indexOf('- name: Set commit status')
    expect(start).toBeGreaterThan(0)
    const block = yml.slice(start)
    expect(block).toContain("if: always() && inputs.commit-status == 'true'")
    expect(block).toContain('continue-on-error: true')
    expect(block).toContain('github.event.pull_request.head.sha || github.sha')
  })

  it('maps a failed diff to failure', () => {
    const r = post({ outcome: 'failure', rows: [{ id: 'a', result: 'CHANGED' }] })
    expect(r.state).toBe('failure')
    expect(r.description).toBe('Design drift: a screen differs from its approved baseline')
  })

  it('maps a diff that never wrote results to failure', () => {
    const r = post({ outcome: 'failure' })
    expect(r.state).toBe('failure')
    expect(r.description).toContain('did not finish')
  })

  it('maps unapproved new and subtle tiles to pending with a count', () => {
    const r = post({
      outcome: 'success',
      rows: [
        { id: 'a', result: 'ok' },
        { id: 'b', result: 'new' },
        { id: 'c', result: 'subtle' },
      ],
    })
    expect(r.state).toBe('pending')
    expect(r.description).toBe('Review needed: 2 changed screens')
  })

  it('uses the singular for one screen', () => {
    const r = post({ outcome: 'success', rows: [{ id: 'b', result: 'new' }] })
    expect(r.description).toBe('Review needed: 1 changed screen')
  })

  it('fails closed when a successful diff has no results to inspect', () => {
    expect(post({ outcome: 'success' }).state).toBe('failure')
  })

  it.each([{ rows: [] }, { rows: [{ id: 'a', result: 'unexpected' }] }])(
    'requires recognized comparison evidence for success (%j)',
    ({ rows }) => {
      expect(post({ outcome: 'success', rows }).state).toBe('failure')
    },
  )

  it('maps all-matching tiles to success', () => {
    const r = post({ outcome: 'success', rows: [{ id: 'a', result: 'ok' }] })
    expect(r.state).toBe('success')
    expect(r.description).toBe('All screens match approved baselines')
  })

  it('names the context design-spine, with the suffix when set', () => {
    expect(post({ outcome: 'success', rows: [] }).context).toBe('design-spine')
    expect(post({ outcome: 'success', rows: [], suffix: 'linux' }).context).toBe(
      'design-spine/linux',
    )
  })

  it('posts to the statuses endpoint for the given sha with the run url', () => {
    const r = post({ outcome: 'success', rows: [], sha: 'deadbeef' })
    expect(r.args).toContain('repos/o/r/statuses/deadbeef')
    expect(r.url).toBe('https://github.com/o/r/actions/runs/42')
  })

  it('warns but exits 0 when posting fails', () => {
    const r = post({ outcome: 'success', rows: [], ghFails: true })
    expect(r.result.status).toBe(0)
    expect(r.result.stdout).toContain('::warning::')
  })
})
