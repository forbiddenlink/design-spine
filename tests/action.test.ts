import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

/** The `run: |` body of one composite step, dedented. */
function stepScript(name: string): string {
  const lines = readFileSync('action.yml', 'utf8').split('\n')
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

const root = mkdtempSync(join(tmpdir(), 'spine-action-'))
afterAll(() => rmSync(root, { recursive: true, force: true }))

describe('action summary for a run that did not finish', () => {
  const script = stepScript('Summarize a run that did not finish')
  const run = (summary: string, env: Record<string, string>) =>
    spawnSync('bash', ['-e', '-c', script], {
      env: { ...process.env, SPINE_SUMMARY: summary, ...env },
      encoding: 'utf8',
    })

  it('writes a failing summary with the comment marker when capture failed', () => {
    const summary = join(root, 'capture.md')
    const result = run(summary, { CAPTURE_OUTCOME: 'failure', DIFF_OUTCOME: 'skipped' })
    expect(result.status).toBe(0)
    const text = readFileSync(summary, 'utf8')
    expect(text.startsWith('<!-- design-spine -->\n## Design Spine: failed\n')).toBe(true)
    expect(text).toContain('The `Capture` step did not finish (capture: failure, compare: skipped)')
  })

  it('names the compare step when capture succeeded but compare wrote nothing', () => {
    const summary = join(root, 'compare.md')
    run(summary, { CAPTURE_OUTCOME: 'success', DIFF_OUTCOME: 'failure' })
    expect(readFileSync(summary, 'utf8')).toContain('The `Compare with approved baselines` step')
  })

  it('leaves a summary written by spine diff untouched', () => {
    const summary = join(root, 'done.md')
    writeFileSync(summary, '<!-- design-spine -->\n## Design Spine: passed\n')
    expect(run(summary, { CAPTURE_OUTCOME: 'success', DIFF_OUTCOME: 'success' }).status).toBe(0)
    expect(readFileSync(summary, 'utf8')).toBe('<!-- design-spine -->\n## Design Spine: passed\n')
  })
})

describe('action artifact names', () => {
  const yml = readFileSync('action.yml', 'utf8')
  const suffix = ['${{ inputs.name-suffix', "format('-{0}', inputs.name-suffix) || '' }}"].join(
    ' && ',
  )

  it('declares an optional name-suffix input that defaults to empty', () => {
    expect(yml).toMatch(/\n {2}name-suffix:\n(?: {4}.*\n)*? {4}required: false\n {4}default: ""\n/)
  })

  it('appends the suffix only when set, to both uploads and the summary link', () => {
    expect(yml).toContain(`name: design-spine-run${suffix}\n`)
    expect(yml).toContain(`name: design-spine-report${suffix}\n`)
    expect(yml).toContain(`SPINE_REPORT_ARTIFACT: design-spine-report${suffix}\n`)
    expect(yml).not.toMatch(/name: design-spine-(run|report)\n/)
  })
})

it('passes --report-artifact only with a suffix, so an older pinned CLI keeps working', () => {
  const yml = readFileSync('action.yml', 'utf8')
  expect(yml).toContain('if [ -n "$SPINE_NAME_SUFFIX" ]; then args+=(--report-artifact')
  expect(yml).not.toMatch(/args=\([^)]*--report-artifact/)
})
