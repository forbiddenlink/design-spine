import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Command } from 'commander'
import { validateManifest } from '../lib/manifest.ts'
import {
  draftManifest,
  findAppDir,
  hasPagesRouter,
  isManifestSafeRoute,
  scanRoutes,
  slugCollisions,
} from '../lib/routes.ts'
import { writeJson } from '../lib/runs.ts'
import { readSitemap } from '../lib/sitemap.ts'
import { guard, root } from './shared.ts'

export function registerPlan(program: Command): void {
  program
    .command('plan')
    .description('Scan a Next.js app/ dir, or read a sitemap, and write a draft design-spine.json')
    .option('--app <dir>', 'app directory (default: app or src/app)')
    .option('--sitemap <url>', 'read routes from a sitemap.xml URL instead of app/ (any framework)')
    .option('--limit <n>', 'with --sitemap: keep at most this many routes', '200')
    .option('--out <file>', 'manifest path', 'design-spine.json')
    .option('--base <url>', 'base URL (default: http://localhost:3000, or the sitemap origin)')
    .option('--force', 'overwrite an existing manifest')
    .option('--all-states', 'add empty/loading/error/partial todo states to every route')
    .action(guard(planAction))
}

export interface PlanOptions {
  app?: string
  sitemap?: string
  limit: string
  out: string
  base?: string
  force?: boolean
  allStates?: boolean
}

export async function planAction(raw: PlanOptions): Promise<void> {
  {
    if (raw.sitemap) {
      let sitemap: URL
      try {
        sitemap = new URL(raw.sitemap)
      } catch {
        throw new Error('--sitemap: expected a full URL such as https://example.com/sitemap.xml')
      }
      if (!/^https?:$/.test(sitemap.protocol)) throw new Error('--sitemap: expected http or https')
      const limit = Number(raw.limit)
      if (!Number.isInteger(limit) || limit < 1 || limit > 2000)
        throw new Error('--limit: expected an integer 1–2000')
      const out = resolve(root, raw.out)
      if (existsSync(out) && !raw.force)
        throw new Error(`${raw.out} exists. Pass --force to overwrite.`)
      const found = await readSitemap(sitemap.href, async (url) => {
        const response = await fetch(url, { signal: AbortSignal.timeout(15000) })
        if (!response.ok)
          throw new Error(`Sitemap request failed: HTTP ${response.status} for ${url}`)
        return response.text()
      })
      if (!found.paths.length) throw new Error('No routes on the sitemap host were found.')
      const paths = found.paths.slice(0, limit)
      const manifest = draftManifest(
        { static: paths, dynamic: [] },
        raw.base ?? sitemap.origin,
        raw.allStates,
      )
      // A sitemap says nothing about how the app stores its theme, so follow the OS setting.
      manifest.themes = { light: 'light', dark: 'dark', method: 'media' }
      writeJson(out, validateManifest(manifest))
      console.log(`Routes from sitemap (${paths.length}):`)
      for (const path of paths) console.log(`  ${path}`)
      if (found.paths.length > paths.length)
        console.warn(
          `Kept the first ${paths.length} of ${found.paths.length} routes. Raise --limit to keep more.`,
        )
      if (found.skipped)
        console.warn(
          `Skipped ${found.skipped} sitemap entries on another host, with a query string, or with a path a manifest cannot hold.`,
        )
      for (const group of slugCollisions(paths))
        console.warn(
          `Slug collision: ${group.join(' and ')} produce the same tile filenames, so they cannot be captured together. Exclude one route or capture them separately with --routes.`,
        )
      console.log(
        `Wrote ${raw.out} with baseUrl ${manifest.baseUrl} and themes.method "media". Every route has the ideal state only; add empty, loading and error states by hand.`,
      )
      return
    }
    const o = { ...raw, base: raw.base ?? 'http://localhost:3000' }
    const appDir = findAppDir(root, o.app ? resolve(root, o.app) : undefined)
    if (!appDir) {
      if (!o.app && hasPagesRouter(root))
        throw new Error(
          'Found a pages/ router. The pages router is not supported yet; Design Spine reads the app/ router.',
        )
      throw new Error('No app/ or src/app/ directory found. Pass --app <dir>.')
    }
    const all = scanRoutes(appDir)
    const unsafe = [...all.static, ...all.dynamic].filter((r) => !isManifestSafeRoute(r))
    const scanned = {
      ...all,
      static: all.static.filter(isManifestSafeRoute),
      dynamic: all.dynamic.filter(isManifestSafeRoute),
    }
    const out = resolve(root, o.out)
    if (existsSync(out) && !o.force) throw new Error(`${o.out} exists. Pass --force to overwrite.`)
    writeJson(out, draftManifest(scanned, o.base, o.allStates))
    console.log(`Static routes (${scanned.static.length}):`)
    for (const r of scanned.static) console.log(`  ${r}`)
    console.log(`Dynamic routes (${scanned.dynamic.length}), need params:`)
    for (const r of scanned.dynamic) console.log(`  ${r}`)
    if (unsafe.length)
      console.warn(
        `Skipped ${unsafe.length} routes containing #, ? or a backslash, which a manifest cannot hold: ${unsafe.join(', ')}`,
      )
    for (const group of slugCollisions([...scanned.static, ...scanned.dynamic]))
      console.warn(
        `Slug collision: ${group.join(' and ')} produce the same tile filenames, so they cannot be captured together. Renaming states does not help; exclude one route (state "exclude") or capture them separately with --routes.`,
      )
    console.log(
      o.allStates
        ? `Wrote ${o.out}. Every route has empty/loading/error/partial states as todo:true; seed them, then drop the flag.`
        : `Wrote ${o.out}. Static routes have ideal only (plus loading/error where a loading or error file exists); dynamic routes need params and have todo states. Pass --all-states to add empty/loading/error/partial todo states to every route.`,
    )
  }
}
