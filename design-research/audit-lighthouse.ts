// Sequential audits avoid competing browser processes skewing measurements.
const chrome = '/Users/elizabethstein/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
const cases = process.argv.includes('--final') ? [
  ['mobile-final', 'http://localhost:14747', false],
  ['desktop-final', 'http://localhost:14747', true],
] as const : [
  ['before-mobile', 'http://localhost:14748', false],
  ['before-desktop', 'http://localhost:14748', true],
  ['desktop-final', 'http://localhost:14747', true],
] as const
for (const [name, url, desktop] of cases) {
  const args = ['npm', 'exec', '--cache', '/Volumes/LizsDisk/design-spine/design-research/.tool-cache', '--yes', '--package=lighthouse@13.5.0', '--', 'lighthouse', url, '--chrome-flags=--headless --no-sandbox', '--only-categories=performance,accessibility,best-practices', '--output=json', `--output-path=design-research/lighthouse-${name}.json`, '--quiet']
  if (desktop) args.push('--preset=desktop')
  const process = Bun.spawn(args, { env: { ...Bun.env, CHROME_PATH: chrome }, stdout: 'inherit', stderr: 'inherit' })
  if (await process.exited) throw new Error(`Lighthouse failed: ${name}`)
  const result = await Bun.file(`design-research/lighthouse-${name}.json`).json()
  console.log(name, Object.fromEntries(Object.entries(result.categories).map(([key, value]: [string, any]) => [key, value.score])))
}
