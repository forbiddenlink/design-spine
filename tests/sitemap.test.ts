import { expect, it } from 'vitest'
import { parseSitemap, readSitemap } from '../src/lib/sitemap.ts'

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://www.example.com/</loc></url>
  <url><loc>https://example.com/pricing/</loc></url>
  <url><loc>https://example.com/pricing</loc></url>
  <url><loc><![CDATA[https://example.com/blog/a&b]]></loc></url>
  <url><loc>https://example.com/search?q=1&amp;page=2</loc></url>
  <url><loc>https://other.test/elsewhere</loc></url>
  <url><loc>javascript:alert(1)</loc></url>
</urlset>`

it('turns same-host sitemap entries into deduplicated local route paths', () => {
  expect(parseSitemap(sitemap, 'https://example.com/sitemap.xml')).toEqual({
    paths: ['/', '/blog/a&b', '/pricing'],
    nested: [],
    skipped: 3,
  })
})

it('follows one level of sitemap index and never leaves the sitemap host', async () => {
  const pages: Record<string, string> = {
    'https://example.com/sitemap.xml':
      '<sitemapindex><sitemap><loc>https://example.com/a.xml</loc></sitemap><sitemap><loc>https://evil.test/b.xml</loc></sitemap></sitemapindex>',
    'https://example.com/a.xml':
      '<urlset><url><loc>https://example.com/docs</loc></url><url><loc>https://example.com/about</loc></url></urlset>',
  }
  const requested: string[] = []
  const found = await readSitemap('https://example.com/sitemap.xml', async (url) => {
    requested.push(url)
    const body = pages[url]
    if (!body) throw new Error(`unexpected request ${url}`)
    return body
  })
  expect(requested).toEqual(['https://example.com/sitemap.xml', 'https://example.com/a.xml'])
  expect(found).toEqual({ paths: ['/about', '/docs'], skipped: 1 })
})
