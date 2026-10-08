import { chromium } from 'playwright'
import { PNG } from 'pngjs'
import { writeFileSync, copyFileSync } from 'node:fs'
import { waitForCaptureAssets, runCapture } from '../src/lib/capture.ts'
const png = new PNG({ width: 120, height: 60 }); png.data.fill(255)
for (let i = 0; i < png.data.length; i += 4) { png.data[i] = 32; png.data[i + 1] = 96; png.data[i + 2] = 64 }
const image = PNG.sync.write(png)
const server = Bun.serve({ port: 0, async fetch(request) {
 const path = new URL(request.url).pathname
 if (path === '/slow.png' || path === '/lazy.png') { await Bun.sleep(path === '/slow.png' ? 2000 : 1800); return new Response(new Uint8Array(image), { headers: { 'content-type': 'image/png' } }) }
 if (path === '/pending-font.woff2') { await Bun.sleep(1500); return new Response('Generated invalid font', { headers: { 'content-type': 'font/woff2' } }) }
 if (path === '/broken.png') return new Response('missing', { status: 404 })
 return new Response('<!doctype html><html lang="en"><title>Generated capture readiness</title><style>body{margin:0;font:24px system-ui}</style><h1>Generated capture readiness</h1><div style="height:5000px"></div><img src="/lazy.png" loading="lazy" width="120" height="60" alt="Generated image"></html>', { headers: { 'content-type': 'text/html' } })
} })
const base = 'http://localhost:' + server.port
const browser = await chromium.launch()
const checks: { check: string; passed: boolean }[] = []
function check(name: string, passed: boolean): void { checks.push({ check: name, passed }); if (!passed) throw new Error(name) }
try {
 const page = await browser.newPage()
 await page.goto(base, { waitUntil: 'domcontentloaded' })
 await page.evaluate(base => { document.body.innerHTML = '<img src="' + base + '/slow.png" alt="Slow generated image">' }, base)
 const start = performance.now(); const ready = await waitForCaptureAssets(page, 100)
 check('pending images return a bounded timeout', !ready && performance.now() - start < 1000)
 await page.evaluate(base => { document.body.innerHTML = '<img src="' + base + '/broken.png" alt="Broken generated image">' }, base)
 check('broken images settle without hanging or hiding the failure', await waitForCaptureAssets(page, 1000) && await page.locator('img').evaluate((img: HTMLImageElement) => img.naturalWidth === 0))
 await page.evaluate(() => { document.body.innerHTML = '<h1>No image assets</h1>' })
 check('empty asset list settles', await waitForCaptureAssets(page, 100))
 await page.evaluate(base => { const style = document.createElement('style'); style.textContent = '@font-face{font-family:pending;src:url(' + base + '/pending-font.woff2)}body{font-family:pending}'; document.head.append(style); void document.body.offsetHeight }, base)
 await page.waitForFunction(() => document.fonts.status === 'loading')
 check('pending fonts respect the same bounded wait', !await waitForCaptureAssets(page, 100))
 check('font failure settles to fallback rather than hanging', await waitForCaptureAssets(page, 2500))
 const captured = await runCapture({ root: '/Volumes/LizsDisk/design-spine/design-research/.design-spine/runs/readiness-sandbox', manifest: { baseUrl: base, viewports: [390], themes: { light: 'light', dark: 'dark', method: 'media' }, routes: [{ path: '/', states: [{ name: 'delayed-lazy-image' }] }] }, baseUrl: base, concurrency: 1 })
 check('actual capture pipeline includes delayed image in both themes', captured.run.tiles.every(tile => !tile.error && tile.brokenImages.length === 0))
 for (const tile of captured.run.tiles) { const buffer = await Bun.file(captured.dir + '/' + tile.file).arrayBuffer(); const screenshot = PNG.sync.read(Buffer.from(buffer)); let greenPixels = 0; for (let i = 0; i < screenshot.data.length; i += 4) if (screenshot.data[i] === 32 && screenshot.data[i + 1] === 96 && screenshot.data[i + 2] === 64) greenPixels++; check(tile.theme + ': decoded lazy image pixels present in real screenshot', greenPixels >= 7000); copyFileSync(captured.dir + '/' + tile.file, 'design-research/screenshots/after/readiness-capture-' + tile.theme + '.png') }
 writeFileSync('design-research/capture-readiness-checks.json', JSON.stringify({ checks, run: captured.run, note: 'Generated local assets only; no changes to existing captures or baselines' }, null, 2)); console.log(checks.length + ' asset readiness checks passed')
} finally { await browser.close(); server.stop() }
