import { chromium } from 'playwright'
import { PNG } from 'pngjs'
import { writeFileSync } from 'node:fs'
import { compareImages } from '../src/lib/diff.ts'
const pixel = new PNG({ width: 240, height: 120 }); pixel.data.fill(255)
for (let i = 0; i < pixel.data.length; i += 4) { pixel.data[i] = 32; pixel.data[i + 1] = 96; pixel.data[i + 2] = 64 }
const png = PNG.sync.write(pixel)
const server = Bun.serve({ port: 0, async fetch(request) {
 const path = new URL(request.url).pathname
 if (path === '/lazy.png') { await Bun.sleep(1800); return new Response(new Uint8Array(png), { headers: { 'content-type': 'image/png' } }) }
 return new Response('<!doctype html><html lang="en"><title>Generated stability fixture</title><style>body{margin:0;font:24px system-ui}.motion{width:100px;height:80px;background:#b94713;animation:slide 1.7s linear infinite alternate}@keyframes slide{to{transform:translateX(180px)}}</style><h1>Generated stability fixture</h1><div class="motion"></div><div style="height:5000px"></div><img src="/lazy.png" loading="lazy" width="240" height="120" alt="Generated delayed image"></html>', { headers: { 'content-type': 'text/html' } })
} })
const browser = await chromium.launch()
try {
 const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' })
 await page.goto('http://localhost:' + server.port, { waitUntil: 'load' }); await page.waitForLoadState('networkidle')
 await page.waitForTimeout(400)
 const height = await page.evaluate(() => document.documentElement.scrollHeight)
 for (let y = 0; y < height; y += Math.floor(844 * .8)) { await page.evaluate(y => window.scrollTo(0, y), y); await page.waitForTimeout(150) }
 await page.evaluate(() => scrollTo(0, 0)); await page.waitForTimeout(300)
 const before = await page.evaluate(() => { const image = document.querySelector('img')!; return { complete: image.complete, naturalWidth: image.naturalWidth } })
 const first = await page.screenshot({ fullPage: true, path: 'design-research/screenshots/after/stability-current-first.png' })
 await page.waitForTimeout(220)
 const second = await page.screenshot({ fullPage: true, path: 'design-research/screenshots/after/stability-current-second.png' })
 await page.evaluate(async () => { await document.fonts.ready; await Promise.all(Array.from(document.images, image => image.decode().catch(() => {}))) })
 const ready = await page.evaluate(() => { const image = document.querySelector('img')!; return { complete: image.complete, naturalWidth: image.naturalWidth } })
 const disabledFirst = await page.screenshot({ fullPage: true, animations: 'disabled', path: 'design-research/screenshots/after/stability-disabled-first.png' })
 await page.waitForTimeout(220)
 const disabledSecond = await page.screenshot({ fullPage: true, animations: 'disabled', path: 'design-research/screenshots/after/stability-disabled-second.png' })
 const result = { scope: 'Generated local fixture; current wait/scroll recipe reproduced, not actual runCapture invocation', before, ready, currentRepeatRatio: compareImages(PNG.sync.read(first), PNG.sync.read(second), 0.002).ratio, disabledRepeatRatio: compareImages(PNG.sync.read(disabledFirst), PNG.sync.read(disabledSecond), 0.002).ratio, animationPolicyChanged: false, persistentMetadataChanged: false }
 writeFileSync('design-research/capture-stability-investigation.json', JSON.stringify(result, null, 2)); console.log(result)
} finally { await browser.close(); server.stop() }
