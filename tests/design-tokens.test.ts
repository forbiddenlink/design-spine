import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

// The website and the review app share one palette (DESIGN.md). Each file declares it itself,
// because the site deploys alone and the review app ships inside the npm package.
const SHARED = ['ink', 'grey', 'rule', 'film', 'pencil', 'edge', 'mark', 'code-bg']

function tokens(css: string): { light: Record<string, string>; dark: Record<string, string> } {
  const read = (block: string): Record<string, string> =>
    Object.fromEntries(
      [...block.matchAll(/--([a-z-]+):\s*([^;]+);/g)].map((m) => [
        m[1] ?? '',
        (m[2] ?? '').trim().toLowerCase(),
      ]),
    )
  const dark = css.indexOf('@media (prefers-color-scheme: dark)')
  const light = css.slice(css.indexOf(':root'), dark)
  const darkBlock = css.slice(dark, css.indexOf('}', css.indexOf(':root', dark)))
  return { light: read(light.slice(0, light.indexOf('}'))), dark: read(darkBlock) }
}

it('keeps the website and the review app on the same shared tokens', () => {
  const site = tokens(readFileSync('site/index.html', 'utf8'))
  const app = tokens(readFileSync('src/ui/review.css', 'utf8'))
  for (const name of SHARED) {
    expect(app.light[name], `--${name} (light)`).toBe(site.light[name])
    expect(app.dark[name], `--${name} (dark)`).toBe(site.dark[name])
  }
})
