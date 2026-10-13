import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { basename, join } from 'node:path'
import type { CritiqueFile, ReviewFile, RunRecord, Tile } from './types.ts'

export const spineDir = (root: string): string => join(root, '.design-spine')
export const runsDir = (root: string): string => join(spineDir(root), 'runs')
export const baselinesDir = (root: string): string => join(spineDir(root), 'baselines')

export function readJson<T>(path: string): T | null {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T
  } catch {
    return null
  }
}

/** Atomic write so a crashing writer never leaves half a JSON file. */
export function writeJson(path: string, data: unknown): void {
  mkdirSync(join(path, '..'), { recursive: true })
  const tmp = `${path}.${process.pid}.tmp`
  writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`)
  renameSync(tmp, path)
}

export function resolveRunDir(root: string, run = 'latest'): string {
  const rd = runsDir(root)
  if (run === 'latest') {
    const link = join(spineDir(root), 'latest')
    if (existsSync(link)) return realpathSync(link)
    const all = existsSync(rd) ? readdirSync(rd).sort() : []
    const last = all[all.length - 1]
    if (!last) throw new Error('No runs found. Run `spine capture` first.')
    return join(rd, last)
  }
  const p = existsSync(run) ? run : join(rd, run)
  if (!existsSync(join(p, 'run.json'))) throw new Error(`Run not found: ${run}`)
  return p
}

export function setLatest(root: string, runId: string): void {
  const link = join(spineDir(root), 'latest')
  rmSync(link, { force: true })
  symlinkSync(join('runs', runId), link)
}

export const loadRun = (dir: string): RunRecord => {
  const r = readJson<RunRecord>(join(dir, 'run.json'))
  if (!r) throw new Error(`Missing run.json in ${dir}`)
  return r
}
export const loadReview = (dir: string): ReviewFile => {
  const path = join(dir, 'review.json')
  if (!existsSync(path)) return { tiles: {} }
  const review = readJson<ReviewFile>(path)
  if (!review?.tiles || typeof review.tiles !== 'object' || Array.isArray(review.tiles)) {
    throw new Error(
      'Invalid review.json. Preserve the file and repair it before saving more reviews.',
    )
  }
  for (const entry of Object.values(review.tiles)) {
    if (
      !entry ||
      !['approve', 'reject', null].includes(entry.decision) ||
      typeof entry.note !== 'string' ||
      (entry.anchor !== undefined &&
        (!entry.anchor ||
          !Number.isFinite(entry.anchor.x) ||
          !Number.isFinite(entry.anchor.y) ||
          entry.anchor.x < 0 ||
          entry.anchor.y < 0 ||
          !/^[a-f0-9]{64}$/.test(entry.anchor.imageHash)))
    ) {
      throw new Error(
        'Invalid review.json entry. Preserve the file and repair it before saving more reviews.',
      )
    }
  }
  return review
}
export const loadCritique = (dir: string): CritiqueFile | null =>
  readJson<CritiqueFile>(join(dir, 'critique.json'))

export const runIdOf = (dir: string): string => basename(dir)

export const isFlagged = (t: Tile): boolean =>
  !!t.error ||
  t.stability === 'unstable' ||
  !!t.accessibility?.error ||
  !!t.accessibility?.violations.length ||
  t.status === 0 ||
  t.status >= 400 ||
  t.overflowX ||
  t.blankRegions.count > 0 ||
  t.brokenImages.length > 0 ||
  t.consoleErrors.length > 0 ||
  t.pageErrors.length > 0 ||
  !!t.redirectedTo
