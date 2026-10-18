// tests/e2e/library.spec.js
import { test, expect } from '@playwright/test'
import { openApp } from '../helpers/app.js'
const typeCode = async (page, code) => { await page.click('#editor .cm-content'); await page.keyboard.press('Control+A'); await page.keyboard.insertText(code) }
const code = (page) => page.evaluate(() => capjsDebug.session.code)
test.beforeEach(async ({ page }) => { await openApp(page) })

test('save adds a version with a thumbnail; history can reopen v1', async ({ page }) => {
  const v1 = await code(page)
  await typeCode(page, 'x.fillRect(0,0,99,99)')
  await expect(page.locator('#modified-dot')).toBeVisible()
  await page.keyboard.press('Control+S')
  await expect(page.locator('#modified-dot')).toBeHidden()
  await expect(page.locator('.lib-item').first()).toContainText('v2')
  await expect(page.locator('.lib-item img').first()).toHaveAttribute('src', /^blob:/)
  await page.click('#btn-history'); await page.locator('#history-panel [data-version-id]').last().getByText('Open').click()
  expect(await code(page)).not.toBe('x.fillRect(0,0,99,99)')
  expect(await code(page)).toBe(v1)
})
// Ruling R20: the Fork button copies the editor's current contents, unsaved edits included.
test('fork copies unsaved edits into the new creation', async ({ page }) => {
  await typeCode(page, 'unsavedFork()')
  await page.click('#btn-fork')
  await expect(page.locator('.lib-item')).toHaveCount(2)
  await expect(page.locator('#creation-name')).toHaveValue(/ fork$/)
  expect(await code(page)).toBe('unsavedFork()')
  expect(await page.evaluate(() => capjsDebug.session.modified)).toBe(false)
})
test('fork creates a second creation; switching keeps unsaved drafts', async ({ page }) => {
  await page.click('#btn-fork')
  await expect(page.locator('.lib-item')).toHaveCount(2)
  await typeCode(page, 'draftA()')
  await page.locator('.lib-item').nth(1).click()
  await page.locator('.lib-item').nth(0).click()
  await expect.poll(() => code(page)).toBe('draftA()')
})
test('new from template, delete, restore from gallery', async ({ page }) => {
  await page.click('#btn-new'); await page.click('[data-template="shadertoy"]')
  await expect(page.locator('#editor')).toContainText('mainImage')
  page.on('dialog', d => d.accept())
  const n = await page.locator('.lib-item').count()
  await page.locator('.lib-item').first().getByTitle('Delete').click()
  await expect(page.locator('.lib-item')).toHaveCount(n - 1)
  await page.click('#btn-show-all'); await page.locator('#gallery-deleted [data-restore]').first().click()
  await expect(page.locator('.lib-item')).toHaveCount(n)
})
test('export then import into a fresh profile restores the library', async ({ page, browser }) => {
  await typeCode(page, 'exported()'); await page.keyboard.press('Control+S')
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btn-export')])
  const ctx = await browser.newContext(); const p2 = await ctx.newPage()
  await p2.goto('./'); await p2.waitForFunction(() => window.capjsDebug)
  p2.on('dialog', d => d.accept())
  await p2.setInputFiles('#import-input', await dl.path())
  await expect(p2.locator('.lib-item')).toHaveCount(2)
})
test('bulk .txt import and sidebar collapse persists', async ({ page }) => {
  await page.setInputFiles('#import-input', [{ name: 'old one.txt', mimeType: 'text/plain', buffer: Buffer.from('x.fillRect(0,0,9,9)') }])
  await expect(page.locator('.lib-item', { hasText: 'old one' })).toBeVisible()
  await page.click('#btn-sidebar-toggle'); await page.reload(); await page.waitForFunction(() => window.capjsDebug)
  await expect(page.locator('#sidebar')).toHaveClass(/collapsed/)
})
test('library unavailable still lets you code', async ({ page }) => {
  await page.addInitScript(() => { indexedDB.open = () => { throw new Error('blocked') } })
  await page.goto('./'); await page.waitForFunction(() => window.capjsDebug)
  await expect(page.locator('#library-error')).toBeVisible()
  await expect.poll(() => page.evaluate(() => capjsDebug.sampleFrame())).toBeGreaterThan(0)
})
test('blocked localStorage and IndexedDB still boot a working editor', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message))
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('denied', 'SecurityError') } })
    indexedDB.open = () => { throw new DOMException('denied', 'SecurityError') }
  })
  await page.goto('./'); await page.waitForFunction(() => window.capjsDebug)
  await expect(page.locator('#library-error')).toBeVisible()
  await expect.poll(() => page.evaluate(() => capjsDebug.sampleFrame())).toBeGreaterThan(0)
  await typeCode(page, 'x.fillRect(0,0,1920,1080)')
  await expect.poll(() => page.evaluate(() => capjsDebug.sampleFrame())).toBeGreaterThan(0.95)
  await page.selectOption('#theme-select', 'light') // a settings save must not throw either
  expect(errors).toEqual([])
})
test('reloading right after typing keeps the edit', async ({ page }) => {
  await typeCode(page, 'x.fillRect(0,0,77,77)//justTyped')
  await page.waitForTimeout(150)
  await page.reload(); await page.waitForFunction(() => window.capjsDebug)
  await expect.poll(() => code(page)).toBe('x.fillRect(0,0,77,77)//justTyped')
})
test('the draft is stored by the time an edit runs', async ({ page }) => {
  await typeCode(page, 'x.fillRect(0,0,55,55)//runNow')
  await page.waitForTimeout(400) // the run starts at 300 ms; the draft timer alone would fire at 500 ms
  const stored = await page.evaluate(() => new Promise((resolve, reject) => {
    const req = indexedDB.open('capjs')
    req.onerror = () => reject(req.error)
    req.onsuccess = () => {
      const get = req.result.transaction('drafts').objectStore('drafts').get(capjsDebug.session.creation.id)
      get.onsuccess = () => { resolve(get.result?.code ?? null); req.result.close() }
    }
  }))
  expect(stored).toBe('x.fillRect(0,0,55,55)//runNow')
})
test('undo never reaches into the previously open creation', async ({ page }) => {
  await page.click('#btn-fork')
  await expect(page.locator('.lib-item')).toHaveCount(2)
  await typeCode(page, 'x.fillRect(0,0,11,11)//inFork')
  await page.locator('.lib-item').nth(1).click()
  await expect.poll(() => code(page)).not.toContain('inFork')
  const opened = await code(page)
  await page.click('#editor .cm-content'); await page.keyboard.press('Control+Z'); await page.keyboard.press('Control+Z')
  await page.waitForTimeout(100)
  expect(await code(page)).toBe(opened)
})
test('History Open asks before replacing unsaved edits', async ({ page }) => {
  const v1 = await code(page)
  await typeCode(page, 'x.fillRect(0,0,22,22)//unsaved')
  const dialogs = []
  page.once('dialog', d => { dialogs.push(d.message()); d.dismiss() })
  await page.click('#btn-history'); await page.locator('#history-panel [data-version-id]').last().getByText('Open').click()
  await expect.poll(() => dialogs.length).toBe(1)
  expect(await code(page)).toBe('x.fillRect(0,0,22,22)//unsaved')
  page.once('dialog', d => { dialogs.push(d.message()); d.accept() })
  await page.click('#btn-history'); await page.locator('#history-panel [data-version-id]').last().getByText('Open').click()
  await expect.poll(() => code(page)).toBe(v1)
  expect(dialogs).toHaveLength(2)
})
test('saving right after typing leaves no stale draft behind', async ({ page }) => {
  await typeCode(page, 'x.fillRect(0,0,33,33)//first')
  await page.waitForTimeout(700) // its draft is stored
  await typeCode(page, 'x.fillRect(0,0,44,44)//second')
  await page.keyboard.press('Control+S')
  await expect(page.locator('#modified-dot')).toBeHidden()
  await page.reload(); await page.waitForFunction(() => window.capjsDebug)
  await expect.poll(() => code(page)).toBe('x.fillRect(0,0,44,44)//second')
  await expect(page.locator('#modified-dot')).toBeHidden()
})
test('Delete everything asks twice, then empties the library and starts fresh', async ({ page }) => {
  await page.click('#btn-fork') // two creations
  await expect(page.locator('.lib-item')).toHaveCount(2)
  const answers = [] // each dialog takes the next answer: undefined accepts a confirm, a string fills a prompt
  page.on('dialog', d => d.accept(answers.shift()))
  // declining the typed confirmation deletes nothing
  answers.push(undefined, 'nope')
  await page.click('#btn-show-all'); await page.click('#btn-clear-library')
  await page.waitForTimeout(300)
  await page.keyboard.press('Escape')
  await expect(page.locator('.lib-item')).toHaveCount(2)
  // confirming deletes everything and reloads into a fresh default dweet
  answers.push(undefined, 'DELETE')
  await page.click('#btn-show-all')
  await Promise.all([page.waitForEvent('load'), page.click('#btn-clear-library')])
  await page.waitForFunction(() => window.capjsDebug)
  await expect(page.locator('.lib-item')).toHaveCount(1)
  await expect(page.locator('.lib-item')).toContainText('v1')
  expect(await page.evaluate(() => capjsDebug.session.code)).toContain('fillRect')
})
