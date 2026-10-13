import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { listRuns, selectRun } from '../src/lib/history.ts'

it('lists only contained run directories and rejects traversal and symlink escapes', () => {
  const root = mkdtempSync(join(tmpdir(), 'spine-history-'))
  try {
    for (const id of ['a', 'b']) {
      mkdirSync(join(root, 'runs', id), { recursive: true })
      writeFileSync(join(root, 'runs', id, 'run.json'), JSON.stringify({ id, tiles: [] }))
    }
    mkdirSync(join(root, 'outside'))
    writeFileSync(join(root, 'outside', 'run.json'), '{}')
    symlinkSync(join(root, 'outside'), join(root, 'runs', 'escape'))
    expect(listRuns(join(root, 'runs', 'a')).map((run) => run.id)).toEqual(['b', 'a'])
    expect(selectRun(join(root, 'runs', 'a'), 'b')).toBe(realpathSync(join(root, 'runs', 'b')))
    expect(() => selectRun(join(root, 'runs', 'a'), '../outside')).toThrow()
    expect(() => selectRun(join(root, 'runs', 'a'), 'escape')).toThrow()
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
