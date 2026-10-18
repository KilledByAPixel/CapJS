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
  await expect(page.locator('#error-bar')).toContainText('Line:2')
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
  await expect(page.locator('#time-display')).not.toHaveText('0.00') // running, past its first frame
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
  await expect(page.locator('#help-panel')).toContainText('Suggestions for this program type')
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
  await expect(page.locator('#error-bar')).toContainText('Line:2')
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
test('Escape closes only the topmost open overlay', async ({ page }) => {
  await page.click('#btn-history'); await expect(page.locator('#history-panel')).toBeVisible()
  await page.evaluate(() => document.querySelector('#btn-help').click()) // no pointerdown, so History stays open
  await expect(page.locator('#help-panel')).toBeVisible()
  await page.evaluate(() => document.querySelector('#btn-show-all').click()) // the gallery stacks above the help
  await expect(page.locator('#gallery')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('#gallery')).toBeHidden()
  await expect(page.locator('#help-panel')).toBeVisible()
  await expect(page.locator('#history-panel')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('#help-panel')).toBeHidden()
  await expect(page.locator('#history-panel')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('#history-panel')).toBeHidden()
})
test('the current-line highlight never hides the selection', async ({ page }) => {
  for (const theme of ['capjs', 'one-dark', 'light']) {
    await page.selectOption('#theme-select', theme)
    await page.click('#editor .cm-content'); await page.keyboard.press('Control+A')
    const alpha = await page.evaluate(() => {
      const bg = getComputedStyle(document.querySelector('#editor .cm-activeLine')).backgroundColor
      const parts = bg.match(/\(([^)]+)\)/)[1].split(',').map(Number)
      return parts.length === 4 ? parts[3] : 1
    })
    expect(alpha, theme).toBeLessThan(0.5)
  }
})
test('long lines wrap instead of scrolling sideways', async ({ page }) => {
  await typeCode(page, 'x.fillRect(0,0,9,9)//' + 'a'.repeat(400))
  const { scroll, client } = await page.evaluate(() => {
    const s = document.querySelector('#editor .cm-scroller'); return { scroll: s.scrollWidth, client: s.clientWidth }
  })
  expect(scroll).toBeLessThanOrEqual(client)
})
test('Beautify spreads a squeezed dweet onto lines and can be undone', async ({ page }) => {
  const code = () => page.evaluate(() => capjsDebug.session.code)
  await typeCode(page, 'c.width|=0;for(i=9;i--;)x.fillRect(i,0,9,9)')
  await page.waitForTimeout(600)
  await page.click('#btn-beautify')
  await expect.poll(code).toBe('c.width|=0;\nfor(i=9;i--;)\nx.fillRect(i,0,9,9)')
  await page.click('#editor .cm-content'); await page.keyboard.press('Control+Z')
  await expect.poll(code).toBe('c.width|=0;for(i=9;i--;)x.fillRect(i,0,9,9)')
})
test('pausing while a program is still loading keeps it paused', async ({ page }) => {
  await page.context().route(/runner\/worker\.js/, async route => { await new Promise(r => setTimeout(r, 1500)); await route.continue() })
  await typeCode(page, 'x.fillRect(0,0,t*99,9)')
  await page.waitForTimeout(500) // past the 300 ms change debounce: the slowed load is in flight
  await page.click('#btn-pause')
  await page.waitForTimeout(2000) // the load finishes
  const before = await page.textContent('#time-display')
  await page.waitForTimeout(400)
  expect(await page.textContent('#time-display')).toBe(before)
})
test('Enter inserts a plain newline with no automatic indentation', async ({ page }) => {
  await typeCode(page, 'if(t){')
  await page.keyboard.press('Enter'); await page.keyboard.insertText('a}')
  await page.keyboard.press('Enter'); await page.keyboard.insertText('b')
  await expect.poll(() => page.evaluate(() => capjsDebug.session.code)).toBe('if(t){\na}\nb')
})
test('a file dropped anywhere is never opened by the browser', async ({ page }) => {
  const results = await page.evaluate(async () => {
    const cv = new OffscreenCanvas(4, 4); cv.getContext('2d').fillRect(0, 0, 4, 4)
    const png = new File([await cv.convertToBlob()], 'dot.png', { type: 'image/png' })
    const txt = new File(['x.fillRect(0,0,9,9)'], 'dweet.txt', { type: 'text/plain' })
    // dispatchEvent returns false when a handler cancelled the browser's default (opening the file)
    const drop = (selector, file) => {
      const dt = new DataTransfer(); dt.items.add(file)
      const r = document.querySelector(selector).getBoundingClientRect()
      const fire = (target, type) => target.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }))
      fire(document.querySelector(selector), 'dragenter')
      const target = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
      return { over: !fire(target, 'dragover'), drop: !fire(target, 'drop') }
    }
    return {
      canvasImage: drop('#canvas-host', png),
      canvasText: drop('#canvas-host', txt),
      transport: drop('#transport', png),
      capturePanel: drop('#btn-capture', txt),
    }
  })
  for (const [where, r] of Object.entries(results)) expect(r, where).toEqual({ over: true, drop: true })
  await expect(page.locator('#image-name')).toHaveText('dot.png')
  await expect(page.locator('#drop-overlay')).toBeHidden()
})
test('a syntax error shows its line and column, highlights that line', async ({ page }) => {
  await typeCode(page, 'x.fillRect(0,0,9,9)\ny=)')
  const bar = page.locator('#error-bar')
  await expect(bar.locator('.error-head')).toHaveText(/^SyntaxError: .*\(Line:2, Column:3\)$/)
  await expect(page.locator('#editor .cm-errorLine')).toHaveText('y=)')
})
test('an error deep in a function lists the chain of user lines', async ({ page }) => {
  await typeCode(page, 'function draw(){\n  nope()\n}\ndraw()')
  const bar = page.locator('#error-bar')
  await expect(bar.locator('.error-head')).toHaveText('ReferenceError: nope is not defined (Line:2, Column:3)')
  await expect(bar.locator('.error-frame')).toHaveText(['at draw (Line:2, Column:3)', 'at Line:4, Column:1'])
  await expect(page.locator('#editor .cm-errorLine')).toHaveText('  nope()')
})
test('the first error stays until the code changes', async ({ page }) => {
  await typeCode(page, 'frame==3&&first();frame==4&&second()')
  const head = page.locator('#error-bar .error-head')
  await expect(head).toContainText('first is not defined')
  await page.click('#btn-pause') // resume: the next frame raises a different error
  await expect.poll(() => page.textContent('#time-display')).not.toBe('0.03')
  await expect(head).toContainText('first is not defined')
  await typeCode(page, 'x.fillRect(0,0,9,9)')
  await expect(page.locator('#error-bar')).toBeHidden()
})
test('Ctrl+Space suggests by program type: canvas members after x., uniforms in Shadertoy, engine names in LittleJS', async ({ page }) => {
  const popup = page.locator('.cm-tooltip-autocomplete')
  const suggest = async code => {
    await typeCode(page, code)
    await page.keyboard.press('Control+Space')
    await expect(popup).toBeVisible()
  }
  await suggest('c.width|=0;x.fillR')
  await expect(popup).toContainText('fillRect')
  await expect(popup).toContainText('(x, y, w, h)')
  await page.keyboard.press('Enter')
  await expect.poll(() => page.evaluate(() => capjsDebug.session.code)).toBe('c.width|=0;x.fillRect')
  await suggest('void mainImage(out vec4 c, in vec2 p){c=vec4(iTi')
  await expect(popup).toContainText('iTime')
  await page.keyboard.press('Escape')
  await suggest('function gameRender(){drawRe')
  await expect(popup).toContainText('drawRect', { timeout: 10000 })
})
test('before the code and styles load, the page is dark with the layout hidden (no white flash)', async ({ page }) => {
  await page.route(/\/src\/main\.js/, route => route.abort()) // the dev server's styles arrive through main.js
  await page.goto('./')
  const look = await page.evaluate(() => ({
    bg: getComputedStyle(document.documentElement).backgroundColor,
    app: getComputedStyle(document.getElementById('app')).visibility,
  }))
  expect(look).toEqual({ bg: 'rgb(34, 34, 34)', app: 'hidden' })
})
