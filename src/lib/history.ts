import { readdirSync, realpathSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { loadRun, readJson } from './runs.ts'
import type { RunRecord } from './types.ts'

export function selectRun(initial: string, id?: string | null): string {
  if (!id) return initial
  if (!/^[a-zA-Z0-9._-]+$/.test(id) || id === '.' || id === '..') throw new Error('Invalid run id')
  const parent = realpathSync(dirname(initial))
  const path = realpathSync(join(parent, id))
  if (dirname(path) !== parent) throw new Error('Run outside history directory')
  loadRun(path)
  return path
}

export function listRuns(initial: string): { id: string; startedAt?: string; tiles: number }[] {
  const parent = dirname(realpathSync(initial))
  return readdirSync(parent, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const run = readJson<RunRecord>(join(parent, entry.name, 'run.json'))
      return run && Array.isArray(run.tiles)
        ? { id: entry.name, startedAt: run.startedAt, tiles: run.tiles.length }
        : null
    })
    .filter((run) => run !== null)
    .sort((a, b) => b.id.localeCompare(a.id))
}
