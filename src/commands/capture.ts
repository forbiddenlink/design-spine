import { existsSync } from 'node:fs'
import { availableParallelism } from 'node:os'
import { resolve } from 'node:path'
import type { Command } from 'commander'
import { readManifestJson, runCapture } from '../lib/capture.ts'
import { captureInDocker, manifestInRoot } from '../lib/docker.ts'
import { validateManifest } from '../lib/manifest.ts'
import { flagReasons, isFlagged } from '../lib/runs.ts'
import { startApp } from '../lib/start.ts'
import { guard, numberOption, root } from './shared.ts'

/**
 * Capture mostly waits (load, network idle, scroll pauses), so workers can exceed cores.
 * Measured on a 2-core Linux box, 300 tiles: 3 workers took 220 s, 8 took 94 s.
 */
function defaultConcurrency(): number {
  return Math.min(8, Math.max(4, availableParallelism()))
}

export function registerCapture(program: Command): void {
  program
    .command('capture')
    .description('Capture every route x state x viewport x theme')
    .option('--base <url>', 'base URL of the running app (default: baseUrl in the manifest)')
    .option('--manifest <file>', 'manifest path', 'design-spine.json')
    .option('--routes <list>', 'comma-separated route paths to limit to')
    // No commander default: the description already states it, and commander would print it again.
    .option('--concurrency <n>', 'parallel tiles (default: CPU cores, 4 to 8)')
    .option(
      '--docker',
      'capture inside a pinned Linux x64 Playwright image so baselines match ubuntu-latest CI',
    )
    .option(
      '--start <command>',
      'start the app with this shell command, wait for the base URL, and stop it afterwards',
    )
    .option('--start-timeout <seconds>', 'how long to wait for the started app to answer', '120')
    .action(
      guard(
        async (o: {
          base?: string
          manifest: string
          routes?: string
          concurrency?: string
          docker?: boolean
          start?: string
          startTimeout: string
        }) => {
          const concurrency = numberOption(
            o.concurrency ?? String(defaultConcurrency()),
            'concurrency',
            1,
            32,
          )
          const startTimeout = numberOption(o.startTimeout, 'start-timeout', 1, 3600)
          const mpath = resolve(root, o.manifest)
          if (!existsSync(mpath))
            throw new Error(`Manifest ${o.manifest} not found. Run \`spine plan\`.`)
          const raw = readManifestJson(mpath) as { baseUrl?: unknown }
          const baseUrl = o.base ?? (typeof raw.baseUrl === 'string' ? raw.baseUrl : '')
          if (!baseUrl)
            throw new Error(`No base URL. Pass --base <url> or set baseUrl in ${o.manifest}.`)
          const stopApp = o.start
            ? await startApp(o.start, baseUrl, root, startTimeout * 1000)
            : () => {}
          if (o.docker) {
            validateManifest({ ...raw, baseUrl }, root)
            const code = await captureInDocker({
              root,
              manifest: manifestInRoot(root, o.manifest),
              base: baseUrl,
              hostBase: baseUrl,
              routes: o.routes,
              concurrency: String(concurrency),
              log: console.log,
            })
            process.exit(code)
          }
          const { run, dir, skipped } = await runCapture({
            root,
            manifest: validateManifest({ ...raw, baseUrl }, root),
            baseUrl,
            // Set by --docker, where the container reaches the host through another name.
            recordedBaseUrl: process.env.SPINE_RECORDED_BASE_URL || undefined,
            routes: o.routes?.split(',').map((s) => s.trim()),
            concurrency,
            log: console.log,
          })
          for (const s of skipped) console.warn(`skipped ${s}`)
          const flagged = run.tiles.filter(isFlagged).length
          // Inside --docker the run lives under /work; print where the host will find it.
          const shown = process.env.SPINE_HOST_ROOT
            ? dir.replace(/^\/work(?=\/|$)/, process.env.SPINE_HOST_ROOT)
            : dir
          console.log(`Run ${run.id}: ${run.tiles.length} tiles, ${flagged} flagged -> ${shown}`)
          const reasons = run.tiles
            .filter((t) => !t.error)
            .map((t) => [t.id, flagReasons(t)] as const)
            .filter(([, why]) => why.length)
          if (reasons.length) {
            const w = Math.max(...reasons.map(([id]) => id.length))
            for (const [id, why] of reasons.slice(0, 20))
              console.log(`  ${id.padEnd(w)}  ${why.join('; ')}`)
            if (reasons.length > 20) console.log(`  ${reasons.length - 20} more flagged tiles`)
          }
          const darkSame = run.tiles.filter((t) =>
            t.warnings?.some((w) => w.startsWith('Dark capture is identical')),
          ).length
          if (darkSame)
            console.warn(
              `${darkSame} dark tiles are identical to light; check themes.method in ${o.manifest}.`,
            )
          if (flagged > run.tiles.filter((t) => t.error).length)
            console.log('Open the contact sheet: spine review')
          stopApp()
          const errored = run.tiles.filter((t) => t.error)
          if (errored.length) {
            console.error(`${errored.length} of ${run.tiles.length} tiles failed to capture:`)
            for (const t of errored.slice(0, 5)) console.error(`  ${t.id}: ${t.error}`)
            if (errored.length > 5) console.error(`  ${errored.length - 5} more, see run.json`)
            process.exit(1)
          }
        },
      ),
    )
}
