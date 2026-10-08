import { chromium } from 'playwright'
import { copyFileSync, writeFileSync } from 'node:fs'
import { startReviewServer } from '../src/lib/server.ts'
import { writeJson } from '../src/lib/runs.ts'

const source = await (await fetch('http://localhost:14747/api/run')).json()
const verify = process.argv.includes('--verify')
const mobile = process.argv.includes('--mobile')
const dir = 'design-research/.design-spine/runs/followup-note-investigation'
const tile = source.run.tiles[0]
writeJson(dir + '/run.json', { ...source.run, id: 'followup-note-investigation', tiles: [tile] })
writeJson(dir + '/review.json', { tiles: {} })
copyFileSync('design-research/.design-spine/runs/2026-10-08T15-32-24-858Z/' + tile.file, dir + '/' + tile.file)
const server = startReviewServer(dir, 0)
const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: { width: mobile ? 390 : 1280, height: 900 } })
  await page.goto(`http://localhost:${server.port}`)
  const note = page.getByRole('textbox', { name: 'Review note for ' + tile.id })
  await note.fill('x'.repeat(2500))
  const saved = page.waitForResponse(response => response.url().endsWith('/api/review') && response.request().method() === 'POST')
  await note.press('Tab')
  await saved
  await page.waitForFunction(() => /Saved\.|All changes saved locally\./.test(document.querySelector('#save-status')?.textContent ?? ''))
  const persisted = await (await fetch(`http://localhost:${server.port}/api/run`)).json()
  const result = {
    enteredCharacters: 2500,
    permittedCharacters: await note.getAttribute('maxlength'),
    visibleCharactersAfterSave: (await note.inputValue()).length,
    persistedCharacters: persisted.review.tiles[tile.id].note.length,
    exportDisabled: await page.getByRole('button', { name: 'Export review' }).isDisabled(),
    status: await page.locator('#save-status').innerText(),
    scope: 'Isolated generated run; original fixture reviews untouched',
    viewport: mobile ? 390 : 1280,
  }
  await note.scrollIntoViewIfNeeded()
  if (verify && (result.visibleCharactersAfterSave !== 2000 || result.persistedCharacters !== 2000 || result.exportDisabled || result.permittedCharacters !== '2000')) throw new Error('Note boundary verification failed')
  const suffix = mobile ? '-mobile' : ''
  const name = (verify ? 'followup-note-limit-fixed' : 'followup-note-limit') + suffix
  await page.screenshot({ path: `design-research/screenshots/references/${name}.png` })
  writeFileSync(`design-research/${verify ? 'followup-note-verification' : 'followup-note-investigation'}${suffix}.json`, JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result, null, 2))
} finally {
  await browser.close()
  server.stop()
}
