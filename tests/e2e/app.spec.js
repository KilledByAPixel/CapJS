// tests/e2e/app.spec.js
import { test, expect } from '@playwright/test'
const typeCode = async (page, code) => { await page.click('#editor .cm-content'); await page.keyboard.press('Control+A'); await page.keyboard.insertText(code) }
const ink = (page) => page.evaluate(() => capjsDebug.sampleFrame())

test.beforeEach(async ({ page }) => {
  await page.goto('./'); await page.waitForFunction(() => window.capjsDebug)
  if (await page.locator('#help-panel').isVisible()) await page.keyboard.press('Escape') // first run opens the help
})

test('default program renders and editing re-renders', async ({ page }) => {
  await expect.poll(() => ink(page)).toBeGreaterThan(0)
  await typeCode(page, 'x.fillRect(0,0,1920,1080)')
  await expect.poll(() => ink(page)).toBeGreaterThan(0.95)
  await expect(page.locator('#char-count')).toHaveText('25 / 140')
})
test('errors show with a line number and clear when fixed', async ({ page }) => {
  await typeCode(page, 'x.fillRect(0,0,9,9)\nnope()')
  await expect(page.locator('#error-bar')).toContainText('Line 2')
  await typeCode(page, 'x.fillRect(0,0,9,9)')
  await expect(page.locator('#error-bar')).toBeHidden()
})
test('an infinite loop never freezes the editor', async ({ page }) => {
  await typeCode(page, 'for(;;){}')
  await expect(page.locator('#error-bar')).toContainText('Stopped', { timeout: 3000 })
  await page.keyboard.press('Control+A'); await page.keyboard.insertText('x.fillRect(0,0,1920,1080)')
  await expect.poll(() => ink(page)).toBeGreaterThan(0.95)
})
test('pause, step and slider move time', async ({ page }) => {
  await page.click('#btn-pause'); const t0 = await page.textContent('#time-display')
  await page.click('#btn-step'); await expect(page.locator('#time-display')).not.toHaveText(t0)
  await page.locator('#time-slider').fill('600'); await expect(page.locator('#time-display')).toHaveText('10.00')
})
test('pasting a compressed dweet uncompresses it; compress round-trips', async ({ page }) => {
  await typeCode(page, 'x.fillRect(0,0,9,9)'); await page.click('#btn-compress')
  const compressed = await page.evaluate(() => capjsDebug.session.code)
  expect(compressed.startsWith('eval(unescape(')).toBe(true)
  await page.click('#editor .cm-content'); await page.keyboard.press('Control+A'); await page.keyboard.press('Delete')
  // Ruling R6: permissions are granted before the clipboard is written.
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.evaluate(t => navigator.clipboard.writeText(t), compressed)
  await page.keyboard.press('Control+V')
  await expect.poll(() => page.evaluate(() => capjsDebug.session.code)).toBe('x.fillRect(0,0,9,9);')
})
test('page-mode infinite loop saved as draft boots to safe start', async ({ page }) => {
  await typeCode(page, 'c.style.filter="none";for(;;){}')
  await page.waitForTimeout(800)
  await page.reload(); await page.waitForFunction(() => window.capjsDebug)
  await expect(page.locator('#safe-start')).toBeVisible()
  await expect(page.locator('#editor')).toContainText('for(;;)')
})
test('help opens, lists shortcuts, starts a template', async ({ page }) => {
  await page.click('#btn-help')
  await expect(page.locator('#help-panel')).toContainText('Alt+Up')
  await page.locator('#help-panel [data-template="three"]').click()
  await expect(page.locator('#help-panel')).toBeHidden()
  await expect(page.locator('#editor')).toContainText('THREE')
})
test('first run opens the help once', async ({ browser }) => {
  const ctx = await browser.newContext(); const p = await ctx.newPage()
  await p.goto('./'); await p.waitForFunction(() => window.capjsDebug)
  await expect(p.locator('#help-panel')).toBeVisible()
  await p.reload(); await p.waitForFunction(() => window.capjsDebug)
  await expect(p.locator('#help-panel')).toBeHidden()
  await ctx.close()
})
