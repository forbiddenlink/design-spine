#!/usr/bin/env bun
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { Command } from 'commander'
import { PNG } from 'pngjs'
import { loadManifest, planJobs, runCapture } from './lib/capture.ts'
import { collectDesignRules } from './lib/critique.ts'
import { runCritique } from './lib/critique-run.ts'
import { compareImages } from './lib/diff.ts'
import { evaluateGate } from './lib/gate.ts'
import {
  byFile,
  canUpdateBaseline,
  evaluateRatchet,
  type LintBaseline,
  newOffenders,
  scanDir,
} from './lib/lint.ts'
import { validateManifest } from './lib/manifest.ts'
import { buildReport } from './lib/report.ts'
import { draftManifest, findAppDir, scanRoutes } from './lib/routes.ts'
import {
  baselinesDir,
  isFlagged,
  loadReview,
  loadRun,
  readJson,
  resolveRunDir,
  runIdOf,
  spineDir,
  writeJson,
} from './lib/runs.ts'
import { startReviewServer } from './lib/server.ts'
import type { Provenance } from './lib/types.ts'

const root = resolve(process.env.SPINE_CWD ?? process.cwd())
const program = new Command('spine').description('Design gate for Next.js repos').version('0.1.0')

const fail = (msg: string): never => {
  console.error(`spine: ${msg}`)
  process.exit(2)
}
function numberOption(
  value: string,
  name: string,
  min: number,
  max = Infinity,
  integer = true,
): number {
  const number = Number(value)
  if (
    !value.trim() ||
    !Number.isFinite(number) ||
    number < min ||
    number > max ||
    (integer && !Number.isInteger(number))
  ) {
    throw new Error(
      `--${name} must be ${integer ? 'an integer' : 'a number'} between ${min} and ${max === Infinity ? 'a finite maximum' : max}.`,
    )
  }
  return number
}

const guard =
  <A extends unknown[]>(fn: (...a: A) => Promise<void> | void) =>
  async (...a: A): Promise<void> => {
    try {
      await fn(...a)
    } catch (e) {
      fail((e as Error).message)
    }
  }

program
  .command('report')
  .description(
    'Export a portable offline HTML report with original screenshots and saved decisions',
  )
  .option('--run <id>', 'run id or directory', 'latest')
  .option('--out <file>', 'HTML output path', 'design-spine-report.html')
  .action(
    guard((o: { run: string; out: string }) => {
      const dir = resolveRunDir(root, o.run)
      const out = resolve(root, o.out)
      if (existsSync(out)) throw new Error('Output already exists; choose a new --out path.')
      writeFileSync(out, buildReport(dir, loadRun(dir), loadReview(dir)))
      console.log(`Report saved to ${out}`)
    }),
  )

program
  .command('doctor')
  .description(
    'Validate capture configuration and show unfinished coverage without opening a browser',
  )
  .option('--manifest <file>', 'manifest path', 'design-spine.json')
  .action(
    guard((o: { manifest: string }) => {
      const manifest = validateManifest(loadManifest(resolve(root, o.manifest)), root)
      const { jobs, coverage } = planJobs(manifest)
      const skipped = coverage.filter((entry) => entry.outcome === 'skipped')
      const excluded = coverage.filter((entry) => entry.outcome === 'excluded')
      console.log(
        `${jobs.length} capturable, ${skipped.length} unfinished, ${excluded.length} intentionally excluded tiles.`,
      )
      for (const entry of skipped) console.log(`${entry.id}: ${entry.reason}`)
      if (skipped.length || !jobs.length) process.exit(1)
    }),
  )

program
  .command('plan')
  .description('Scan a Next.js app/ dir and write a draft design-spine.json')
  .option('--app <dir>', 'app directory (default: app or src/app)')
  .option('--out <file>', 'manifest path', 'design-spine.json')
  .option('--base <url>', 'base URL', 'http://localhost:3000')
  .option('--force', 'overwrite an existing manifest')
  .action(
    guard((o: { app?: string; out: string; base: string; force?: boolean }) => {
      const appDir = findAppDir(root, o.app ? resolve(root, o.app) : undefined)
      if (!appDir) throw new Error('No app/ or src/app/ directory found. Pass --app <dir>.')
      const scanned = scanRoutes(appDir)
      const out = resolve(root, o.out)
      if (existsSync(out) && !o.force)
        throw new Error(`${o.out} exists. Pass --force to overwrite.`)
      writeJson(out, draftManifest(scanned, o.base))
      console.log(`Static routes (${scanned.static.length}):`)
      for (const r of scanned.static) console.log(`  ${r}`)
      console.log(`Dynamic routes (${scanned.dynamic.length}), need params:`)
      for (const r of scanned.dynamic) console.log(`  ${r}`)
      console.log(
        `Wrote ${o.out}. Empty/loading/error states are todo:true; seed them, then drop the flag.`,
      )
    }),
  )

program
  .command('capture')
  .description('Capture every route x state x viewport x theme')
  .requiredOption('--base <url>', 'base URL of the running app')
  .option('--manifest <file>', 'manifest path', 'design-spine.json')
  .option('--routes <list>', 'comma-separated route paths to limit to')
  .option('--concurrency <n>', 'parallel tiles', '3')
  .action(
    guard(async (o: { base: string; manifest: string; routes?: string; concurrency: string }) => {
      const concurrency = numberOption(o.concurrency, 'concurrency', 1)
      const mpath = resolve(root, o.manifest)
      if (!existsSync(mpath))
        throw new Error(`Manifest ${o.manifest} not found. Run \`spine plan\`.`)
      const { run, dir, skipped } = await runCapture({
        root,
        manifest: loadManifest(mpath),
        baseUrl: o.base,
        routes: o.routes?.split(',').map((s) => s.trim()),
        concurrency,
        log: console.log,
      })
      for (const s of skipped) console.warn(`skipped ${s}`)
      const flagged = run.tiles.filter(isFlagged).length
      console.log(`Run ${run.id}: ${run.tiles.length} tiles, ${flagged} flagged -> ${dir}`)
    }),
  )

program
  .command('review')
  .description('Serve the contact sheet review app')
  .option('--run <id>', 'run id or path', 'latest')
  .option('--port <n>', 'port', '4747')
  .action(
    guard((o: { run: string; port: string }) => {
      const port = numberOption(o.port, 'port', 0, 65535)
      const dir = resolveRunDir(root, o.run)
      const server = startReviewServer(dir, port)
      console.log(`Reviewing ${runIdOf(dir)}\nhttp://localhost:${server.port}`)
    }),
  )

program
  .command('critique')
  .description('Vision critique of each tile via the Claude Code CLI')
  .option('--run <id>', 'run id or path', 'latest')
  .option('--only-flagged', 'only tiles with automatic flags')
  .option('--limit <n>', 'max tiles')
  .option('--model <name>', 'Claude model', 'sonnet')
  .option('--claude-bin <path>', 'claude binary', process.env.SPINE_CLAUDE_BIN ?? 'claude')
  .option(
    '--repo <dir>',
    'app repo to read DESIGN.md / .impeccable.md / @theme from (default: cwd)',
  )
  .action(
    guard(
      async (o: {
        repo?: string
        run: string
        onlyFlagged?: boolean
        limit?: string
        model: string
        claudeBin: string
      }) => {
        const limit = o.limit === undefined ? undefined : numberOption(o.limit, 'limit', 1)
        const dir = resolveRunDir(root, o.run)
        let tiles = loadRun(dir).tiles.filter((t) => !t.error)
        if (o.onlyFlagged) tiles = tiles.filter(isFlagged)
        if (limit !== undefined) tiles = tiles.slice(0, limit)
        if (!tiles.length) return console.log('Nothing to critique.')
        const f = await runCritique({
          runDir: dir,
          tiles,
          bin: o.claudeBin,
          model: o.model,
          // Without the app's own design docs the critique called the brand's
          // closing-quote glyph and the language switcher "stray" defects.
          rules: collectDesignRules(o.repo ?? root),
          log: console.log,
        })
        console.log(`Wrote ${join(dir, 'critique.json')} (${Object.keys(f.tiles).length} tiles)`)
      },
    ),
  )

program
  .command('approve')
  .description('Copy approved tiles into baselines')
  .option('--run <id>', 'run id or path', 'latest')
  .action(
    guard((o: { run: string }) => {
      const dir = resolveRunDir(root, o.run)
      const run = loadRun(dir)
      const review = loadReview(dir)
      const bdir = baselinesDir(root)
      mkdirSync(bdir, { recursive: true })
      const manifestPath = join(bdir, 'manifest.json')
      const manifest = readJson<{ tiles: Record<string, unknown> }>(manifestPath) ?? { tiles: {} }
      const selected = run.tiles
        .filter((tile) => review.tiles[tile.id]?.decision === 'approve')
        .map((tile) => {
          if (tile.error) throw new Error(`${tile.id}: failed captures cannot become baselines.`)
          const bytes = readFileSync(join(dir, tile.file))
          if (tile.imageHash && createHash('sha256').update(bytes).digest('hex') !== tile.imageHash)
            throw new Error(
              `${tile.id}: screenshot changed after capture; recapture and review before promotion.`,
            )
          return { tile, bytes }
        })
      let n = 0
      for (const { tile: t, bytes } of selected) {
        writeFileSync(join(bdir, t.file), bytes)
        manifest.tiles[t.id] = {
          file: t.file,
          run: run.id,
          approvedAt: new Date().toISOString(),
          provenance: run.provenance,
          recipeHash: t.recipeHash,
          masks: t.masks?.flatMap((mask) => mask.boxes),
        }
        n++
      }
      writeJson(manifestPath, { updatedAt: new Date().toISOString(), tiles: manifest.tiles })
      console.log(`Approved ${n} tiles into ${bdir}`)
    }),
  )

program
  .command('diff')
  .description('Compare a run to baselines; exit 1 when any tile exceeds the threshold')
  .option('--run <id>', 'run id or path', 'latest')
  .option('--threshold <ratio>', 'changed-pixel ratio', '0.002')
  .option(
    '--strict',
    'also require complete coverage, human approval and compatible baseline provenance',
  )
  .action(
    guard(async (o: { run: string; threshold: string; strict?: boolean }) => {
      const threshold = numberOption(o.threshold, 'threshold', 0, 1, false)
      const dir = resolveRunDir(root, o.run)
      const run = loadRun(dir)
      const bdir = baselinesDir(root)
      mkdirSync(join(dir, 'diff'), { recursive: true })
      const baselineManifest = readJson<{
        tiles: Record<
          string,
          { provenance?: Provenance; recipeHash?: string; masks?: import('./lib/types.ts').Box[] }
        >
      }>(join(bdir, 'manifest.json'))
      const rows: { id: string; result: string; ratio: string }[] = []
      let failed = 0
      for (const [index, t] of run.tiles.entries()) {
        if (index > 0 && index % 4 === 0) {
          // Allow decoded buffers to be released before the next image group.
          await new Promise<void>((resolve) => setImmediate(resolve))
          Bun.gc(true)
        }
        const bp = join(bdir, t.file)
        if (t.error || !existsSync(join(dir, t.file))) {
          rows.push({ id: t.id, result: 'no-capture', ratio: '-' })
          failed++
          continue
        }
        if (
          o.strict &&
          (!t.imageHash ||
            createHash('sha256')
              .update(readFileSync(join(dir, t.file)))
              .digest('hex') !== t.imageHash)
        ) {
          rows.push({ id: t.id, result: 'modified-capture', ratio: '-' })
          failed++
          continue
        }
        if (!existsSync(bp)) {
          rows.push({ id: t.id, result: 'new', ratio: '-' })
          continue
        }
        const r = compareImages(
          PNG.sync.read(readFileSync(bp)),
          PNG.sync.read(readFileSync(join(dir, t.file))),
          threshold,
          0.1,
          [
            ...(t.masks ?? []).flatMap((mask) => mask.boxes),
            ...(baselineManifest?.tiles[t.id]?.masks ?? []),
          ],
        )
        if (r.diff) writeFileSync(join(dir, 'diff', t.file), PNG.sync.write(r.diff))
        if (r.exceeds) failed++
        rows.push({
          id: t.id,
          result: r.sizeMismatch ? 'size-changed' : r.exceeds ? 'CHANGED' : 'ok',
          ratio: r.sizeMismatch ? '-' : r.ratio.toFixed(5),
        })
      }
      const w = Math.max(4, ...rows.map((r) => r.id.length))
      console.log(`${'tile'.padEnd(w)}  ${'result'.padEnd(12)}  ratio`)
      for (const r of rows) console.log(`${r.id.padEnd(w)}  ${r.result.padEnd(12)}  ${r.ratio}`)
      console.log(`\n${rows.length} tiles, ${failed} over threshold ${threshold}`)
      const reasons = o.strict
        ? evaluateGate(
            run,
            loadReview(dir),
            rows,
            Object.fromEntries(
              Object.entries(baselineManifest?.tiles ?? {}).map(([id, entry]) => [id, entry]),
            ),
          )
        : []
      for (const reason of reasons) console.error(`gate: ${reason}`)
      if (reasons.length) failed++
      writeJson(join(dir, 'diff.json'), {
        threshold,
        rows,
        policy: o.strict ? 'strict' : 'pixels',
        gateReasons: reasons,
      })
      process.exit(failed ? 1 : 0)
    }),
  )

function lintBaselinePath(): string {
  return join(spineDir(root), 'lint-baseline.json')
}

program
  .command('lint')
  .description('Arbitrary Tailwind value ratchet')
  .option('--exceptions', 'list explained single-line exceptions')
  .option('--dir <dir>', 'directory to scan', 'src')
  .option('--update', 'write the baseline')
  .option('--force', 'allow --update to raise the baseline')
  .action(
    guard((o: { dir: string; update?: boolean; force?: boolean; exceptions?: boolean }) => {
      const dir = resolve(root, o.dir)
      if (!existsSync(dir)) throw new Error(`Directory ${o.dir} not found.`)
      if (o.exceptions) {
        for (const match of scanDir(dir, true))
          console.log(
            `${o.dir}/${match.file}:${match.line}:${match.col} ${match.text} — ${match.reason}`,
          )
        return
      }
      const matches = scanDir(dir)
      const base = readJson<LintBaseline>(lintBaselinePath())
      const { ok, delta } = evaluateRatchet(matches.length, base?.count ?? null)
      console.log(`Arbitrary values: ${matches.length} (baseline ${base ? base.count : 'none'})`)
      if (o.update) {
        if (!canUpdateBaseline(matches.length, base?.count ?? null, !!o.force)) {
          console.error(
            `Refusing to raise the baseline from ${base?.count} to ${matches.length}. Pass --force.`,
          )
          process.exit(1)
        }
        writeJson(lintBaselinePath(), {
          count: matches.length,
          files: byFile(matches),
          updatedAt: new Date().toISOString(),
        })
        console.log(`Baseline written (${matches.length}).`)
        return
      }
      if (!ok) {
        console.error(`Count rose by ${delta}. New offenders:`)
        for (const m of newOffenders(matches, base?.files ?? {}))
          console.error(`  ${o.dir}/${m.file}:${m.line}:${m.col}  ${m.text}`)
        process.exit(1)
      }
    }),
  )

program
  .command('status')
  .description('Write and print .design-spine/status.json')
  .option('--dir <dir>', 'lint directory', 'src')
  .action(
    guard((o: { dir: string }) => {
      let lastRun: string | null = null
      let tiles = 0
      let flagged = 0
      let reviewed = 0
      let approved = 0
      let rejected = 0
      try {
        const dir = resolveRunDir(root)
        const run = loadRun(dir)
        const review = loadReview(dir)
        lastRun = run.id
        tiles = run.tiles.length
        flagged = run.tiles.filter(isFlagged).length
        for (const t of run.tiles) {
          const d = review.tiles[t.id]?.decision
          if (d) reviewed++
          if (d === 'approve') approved++
          if (d === 'reject') rejected++
        }
      } catch {
        // no runs yet
      }
      const ldir = resolve(root, o.dir)
      const lintCount = existsSync(ldir) ? scanDir(ldir).length : null
      const lb = readJson<LintBaseline>(lintBaselinePath())
      const bdir = baselinesDir(root)
      const baselines = existsSync(bdir)
        ? readdirSync(bdir).filter((f) => f.endsWith('.png')).length
        : 0
      const status = {
        lastRun,
        tiles,
        flagged,
        reviewed,
        approved,
        rejected,
        lintCount,
        lintBaseline: lb?.count ?? null,
        baselines,
      }
      writeJson(join(spineDir(root), 'status.json'), status)
      console.log(JSON.stringify(status, null, 2))
    }),
  )

await program.parseAsync(process.argv)
