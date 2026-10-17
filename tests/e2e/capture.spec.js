import { test, expect } from '@playwright/test'
import { openApp } from '../helpers/app.js'
import fs from 'node:fs'
import { parseGif } from '../helpers/gifParse.js'
test.beforeEach(async ({ page }) => { await openApp(page) })
const setCap = async (page, o) => { for (const [k, v] of Object.entries(o)) await page.locator('#cap-' + k).fill(String(v)) }

test('GIF capture: preview, size, single palette, right frame count, unaffected by typing', async ({ page }) => {
  await setCap(page, { width: 320, height: 180, seconds: 1 })
  await page.selectOption('#cap-fps', '30')
  await page.click('#btn-capture')
  await page.click('#editor .cm-content'); await page.keyboard.insertText('//typing during capture')
  await expect(page.locator('#gif-preview')).toBeVisible({ timeout: 30000 })
  await expect(page.locator('#gif-size')).toContainText('MB')
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btn-gif-download')])
  const gif = parseGif(new Uint8Array(fs.readFileSync(await dl.path())))
  expect(gif.width).toBe(320); expect(gif.frames).toHaveLength(30)
  expect(gif.frames.every(f => !f.localColorTable)).toBe(true)
})
test('oversized capture is refused up front', async ({ page }) => {
  await setCap(page, { width: 1920, height: 1080, seconds: 20 })
  page.on('dialog', d => d.accept())
  await page.click('#btn-capture')
  await expect(page.locator('#capture-message')).toContainText('GB of memory')
  await expect(page.locator('#gif-preview')).toBeHidden()
})
test('WebM and screenshot download', async ({ page }) => {
  await setCap(page, { width: 320, height: 180, seconds: 0.5 })
  await page.selectOption('#cap-format', 'webm')
  const [webm] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.click('#btn-capture')])
  expect(fs.statSync(await webm.path()).size).toBeGreaterThan(1000)
  const [png] = await Promise.all([page.waitForEvent('download'), page.click('#btn-screenshot')])
  expect(png.suggestedFilename()).toMatch(/\.png$/)
})
test('edits during a capture wait for it, then restart the live view once', async ({ page }) => {
  const typeCode = async code => { await page.click('#editor .cm-content'); await page.keyboard.press('Control+A'); await page.keyboard.insertText(code) }
  await typeCode('for(e=performance.now();performance.now()-e<30;);x.fillRect(0,0,99,99)') // slow frames: a long capture
  await expect.poll(() => page.evaluate(() => capjsDebug.session.state.step)).toBeGreaterThan(0)
  await setCap(page, { width: 320, height: 180, seconds: 2 })
  await page.selectOption('#cap-fps', '30')
  await page.click('#btn-capture')
  await expect(page.locator('#btn-capture')).toContainText('Cancel')
  const step = await page.evaluate(() => capjsDebug.session.state.step)
  await typeCode('x.fillRect(0,0,1920,1080)')
  await page.evaluate(() => { capjsDebug.session.step(); capjsDebug.session.seek(99) })
  await page.waitForTimeout(500) // past the change debounce
  await expect(page.locator('#btn-capture')).toContainText('Cancel') // still capturing
  expect(await page.evaluate(() => capjsDebug.session.state.step)).toBe(step)
  await expect(page.locator('#gif-preview')).toBeVisible({ timeout: 30000 })
  await expect.poll(() => page.evaluate(() => capjsDebug.sampleFrame())).toBeGreaterThan(0.95)
})
