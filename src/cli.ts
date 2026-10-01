#!/usr/bin/env bun
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { join, resolve } from 'node:path'
import { Command } from 'commander'
import { PNG } from 'pngjs'
import { loadManifest, runCapture } from './lib/capture.ts'
import { collectDesignRules } from './lib/critique.ts'
import { runCritique } from './lib/critique-run.ts'
import { compareImages } from './lib/diff.ts'
import {
  byFile,
  canUpdateBaseline,
  evaluateRatchet,
  type LintBaseline,
  newOffenders,
  scanDir,
} from './lib/lint.ts'
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

const root = resolve(process.env.SPINE_CWD ?? process.cwd())
const program = new Command('spine').description('Design gate for Next.js repos').version('0.1.0')

const fail = (msg: string): never => {
  console.error(`spine: ${msg}`)
  process.exit(2)
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
      const mpath = resolve(root, o.manifest)
      if (!existsSync(mpath))
        throw new Error(`Manifest ${o.manifest} not found. Run \`spine plan\`.`)
      const { run, dir, skipped } = await runCapture({
        root,
        manifest: loadManifest(mpath),
        baseUrl: o.base,
        routes: o.routes?.split(',').map((s) => s.trim()),
        concurrency: Number(o.concurrency) || 3,
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
      const dir = resolveRunDir(root, o.run)
      const server = startReviewServer(dir, Number(o.port))
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
  .action(
    guard(
      async (o: {
        run: string
        onlyFlagged?: boolean
        limit?: string
        model: string
        claudeBin: string
      }) => {
        const dir = resolveRunDir(root, o.run)
        let tiles = loadRun(dir).tiles.filter((t) => !t.error)
        if (o.onlyFlagged) tiles = tiles.filter(isFlagged)
        if (o.limit) tiles = tiles.slice(0, Number(o.limit))
        if (!tiles.length) return console.log('Nothing to critique.')
        const f = await runCritique({
          runDir: dir,
          tiles,
          bin: o.claudeBin,
          model: o.model,
          rules: collectDesignRules(root),
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
      let n = 0
      for (const t of run.tiles) {
        if (review.tiles[t.id]?.decision !== 'approve') continue
        copyFileSync(join(dir, t.file), join(bdir, t.file))
        manifest.tiles[t.id] = { file: t.file, run: run.id, approvedAt: new Date().toISOString() }
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
  .action(
    guard((o: { run: string; threshold: string }) => {
      const dir = resolveRunDir(root, o.run)
      const run = loadRun(dir)
      const threshold = Number(o.threshold)
      const bdir = baselinesDir(root)
      mkdirSync(join(dir, 'diff'), { recursive: true })
      const rows: { id: string; result: string; ratio: string }[] = []
      let failed = 0
      for (const t of run.tiles) {
        const bp = join(bdir, t.file)
        if (t.error || !existsSync(join(dir, t.file))) {
          rows.push({ id: t.id, result: 'no-capture', ratio: '-' })
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
      writeJson(join(dir, 'diff.json'), { threshold, rows })
      process.exit(failed ? 1 : 0)
    }),
  )

function lintBaselinePath(): string {
  return join(spineDir(root), 'lint-baseline.json')
}

program
  .command('lint')
  .description('Arbitrary Tailwind value ratchet')
  .option('--dir <dir>', 'directory to scan', 'src')
  .option('--update', 'write the baseline')
  .option('--force', 'allow --update to raise the baseline')
  .action(
    guard((o: { dir: string; update?: boolean; force?: boolean }) => {
      const dir = resolve(root, o.dir)
      if (!existsSync(dir)) throw new Error(`Directory ${o.dir} not found.`)
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
