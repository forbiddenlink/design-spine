// Cached audited tooling; no install or network package lookup.
const cli = 'design-research/.tool-cache/_npx/1722e863ebfd623b/node_modules/lighthouse/cli/index.js'
const chrome = '/Users/elizabethstein/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
for (const desktop of [false, true]) {
 const name = desktop ? 'desktop' : 'mobile'
 const output = `design-research/review-workflow/lighthouse-${name}.json`
 const args = ['node', cli, 'http://localhost:14870', '--chrome-flags=--headless --no-sandbox', '--only-categories=performance,accessibility,best-practices', '--output=json', `--output-path=${output}`, '--quiet']
 if (desktop) args.push('--preset=desktop')
 const child = Bun.spawn(args, { env: { ...Bun.env, CHROME_PATH: chrome }, stdout: 'inherit', stderr: 'inherit' })
 if (await child.exited) throw new Error('Lighthouse failed: ' + name)
 const result = await Bun.file(output).json()
 console.log(name, Object.fromEntries(Object.entries(result.categories).map(([key, value]: [string, any]) => [key, value.score])))
}
