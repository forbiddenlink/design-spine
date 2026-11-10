import { isManifestSafeRoute } from './routes.ts'

export interface SitemapRoutes {
  /** Local route paths, deduplicated and sorted. */
  paths: string[]
  /** Nested sitemap URLs from a sitemap index. */
  nested: string[]
  /** Entries left out: another host, a query string, or a path a manifest cannot hold. */
  skipped: number
}

const unescapeXml = (text: string): string =>
  text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .trim()

const bareHost = (host: string): string => host.replace(/^www\./, '')

/** Reads `<loc>` entries from a sitemap or sitemap index. Only URLs on the sitemap's own host become routes. */
export function parseSitemap(xml: string, sitemapUrl: string): SitemapRoutes {
  const host = bareHost(new URL(sitemapUrl).hostname)
  const index = /<sitemapindex[\s>]/i.test(xml)
  const paths = new Set<string>()
  const nested: string[] = []
  let skipped = 0
  for (const match of xml.matchAll(/<loc>([\s\S]*?)<\/loc>/gi)) {
    let url: URL
    try {
      url = new URL(unescapeXml(match[1] ?? ''), sitemapUrl)
    } catch {
      skipped++
      continue
    }
    if (!/^https?:$/.test(url.protocol) || bareHost(url.hostname) !== host) {
      skipped++
      continue
    }
    if (index) {
      nested.push(url.href)
      continue
    }
    const path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, '') || '/' : '/'
    if (url.search || path.startsWith('//') || !isManifestSafeRoute(path)) {
      skipped++
      continue
    }
    paths.add(path)
  }
  return { paths: [...paths].sort(), nested, skipped }
}

/** Fetches a sitemap, following one level of sitemap index (at most 20 child sitemaps). */
export async function readSitemap(
  sitemapUrl: string,
  fetchText: (url: string) => Promise<string>,
): Promise<{ paths: string[]; skipped: number }> {
  const first = parseSitemap(await fetchText(sitemapUrl), sitemapUrl)
  const paths = new Set(first.paths)
  let skipped = first.skipped + Math.max(0, first.nested.length - 20)
  for (const child of first.nested.slice(0, 20)) {
    const parsed = parseSitemap(await fetchText(child), sitemapUrl)
    for (const path of parsed.paths) paths.add(path)
    skipped += parsed.skipped + parsed.nested.length
  }
  return { paths: [...paths].sort(), skipped }
}
