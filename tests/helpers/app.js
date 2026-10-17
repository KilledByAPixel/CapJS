import { expect } from '@playwright/test'
// Opens the app and dismisses the help panel that a fresh profile shows on first run.
export async function openApp(page) {
  await page.goto('./'); await page.waitForFunction(() => window.capjsDebug)
  if (await page.locator('#help-panel').isVisible()) {
    await page.keyboard.press('Escape')
    await expect(page.locator('#help-panel')).toBeHidden()
  }
}
