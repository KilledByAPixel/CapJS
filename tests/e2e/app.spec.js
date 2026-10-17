// tests/e2e/app.spec.js
import { test, expect } from '@playwright/test'
import { openApp } from '../helpers/app.js'
const typeCode = async (page, code) => { await page.click('#editor .cm-content'); await page.keyboard.press('Control+A'); await page.keyboard.insertText(code) }
const ink = (page) => page.evaluate(() => capjsDebug.sampleFrame())

test.beforeEach(async ({ page }) => { await openApp(page) })

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
  for (const k of ['Alt+Up', 'Alt+Down', 'Alt+Enter', 'Alt+Right', 'Ctrl+S', 'Ctrl+Space', 'Ctrl+F']) await expect(page.locator('#help-panel')).toContainText(k)
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
// Ruling R23: live worker frames get 1500 ms (+250 ms grace), so slow but finite dweets keep
// running. 1000 ms is past the old 500 + 250 ms kill.
test('a slow but finite dweet frame is not stopped', async ({ page }) => {
  await typeCode(page, 'for(e=performance.now();performance.now()-e<1000;);x.fillRect(0,0,1920,1080)')
  await page.waitForTimeout(3000)
  await expect(page.locator('#error-bar')).toBeHidden()
  await expect.poll(() => ink(page)).toBeGreaterThan(0.95)
  await expect(page.locator('#error-bar')).toBeHidden()
})
test('an html infinite loop is stopped and the page stays responsive', async ({ page }) => {
  await typeCode(page, '<body>\n<script>for(;;);</script>')
  await expect(page.locator('#error-bar')).toContainText('Loop timed out', { timeout: 5000 })
  await expect(page.locator('#error-bar')).toContainText('Line 2')
  await typeCode(page, 'x.fillRect(0,0,1920,1080)')
  await expect.poll(() => ink(page)).toBeGreaterThan(0.95)
})
test('an image dropped on a page-mode canvas becomes the custom image', async ({ page }) => {
  await typeCode(page, 'c.style.filter="none";x.fillRect(0,0,9,9)') // page mode: an iframe fills the host
  await expect(page.locator('#canvas-host iframe')).toBeVisible()
  await page.waitForTimeout(500)
  const dropped = await page.evaluate(async () => {
    const cv = new OffscreenCanvas(4, 4); cv.getContext('2d').fillRect(0, 0, 4, 4)
    const dt = new DataTransfer(); dt.items.add(new File([await cv.convertToBlob()], 'dot.png', { type: 'image/png' }))
    const fire = (target, type) => target.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }))
    fire(document.querySelector('#editor'), 'dragenter') // the drag comes in over the editor
    const r = document.querySelector('#canvas-host').getBoundingClientRect()
    let target = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
    if (target.tagName === 'IFRAME') target = target.contentDocument.body // the browser delivers it inside the frame
    fire(target, 'dragenter'); fire(target, 'dragover'); fire(target, 'drop')
    return target.id || target.tagName
  })
  expect(dropped).toBe('drop-overlay')
  await expect(page.locator('#image-name')).toHaveText('dot.png')
  await expect(page.locator('#drop-overlay')).toBeHidden()
})
