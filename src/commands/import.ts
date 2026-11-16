import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Command } from 'commander'
import { convertLostPixel, type LostPixelConfig } from '../lib/lostpixel.ts'
import { readJson, writeJson } from '../lib/runs.ts'
import { guard, root } from './shared.ts'

export function registerImport(program: Command): void {
  program
    .command('import')
    .description("Write design-spine.json from another tool's config (supported: lost-pixel)")
    .argument('<tool>', 'lost-pixel')
    .option('--config <file>', 'Lost Pixel config (default: lostpixel.config.ts/js/cjs/mjs)')
    .option('--pages <file>', 'JSON array of extra pages, such as the output of pagesJsonUrl')
    .option('--out <file>', 'manifest to write', 'design-spine.json')
    .option('--force', 'overwrite an existing manifest')
    .action(
      guard(
        async (
          tool: string,
          o: { config?: string; pages?: string; out: string; force?: boolean },
        ) => {
          if (tool !== 'lost-pixel')
            throw new Error(`Unknown tool "${tool}". Supported: lost-pixel.`)
          const candidates = o.config
            ? [resolve(root, o.config)]
            : ['ts', 'js', 'cjs', 'mjs'].map((ext) => resolve(root, `lostpixel.config.${ext}`))
          const file = candidates.find((path) => existsSync(path))
          if (!file)
            throw new Error(
              `No Lost Pixel config found (${o.config ?? 'lostpixel.config.ts/js/cjs/mjs'}). Pass --config <file>.`,
            )
          const out = resolve(root, o.out)
          if (existsSync(out) && !o.force)
            throw new Error(`${o.out} exists. Pass --force to overwrite.`)
          // Lost Pixel itself executes this file; resolve the same exports it does.
          const mod = (await import(file)) as { default?: unknown; config?: unknown }
          const config = (mod.default ?? mod.config ?? mod) as LostPixelConfig
          let extra: unknown[] = []
          if (o.pages) {
            const parsed = readJson<unknown>(resolve(root, o.pages))
            if (!Array.isArray(parsed))
              throw new Error(`${o.pages} must contain a JSON array of pages.`)
            extra = parsed
          }
          const { manifest, notes } = convertLostPixel(config, extra)
          writeJson(out, manifest)
          const states = manifest.routes.reduce((n, route) => n + route.states.length, 0)
          console.log(
            `Wrote ${o.out}: ${manifest.routes.length} routes, ${states} states, widths ${manifest.viewports.join(', ')}.`,
          )
          for (const note of notes) console.log(`  note: ${note}`)
          console.log('Next: spine doctor, then spine capture.')
        },
      ),
    )
}
