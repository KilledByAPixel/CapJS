import { test, expect } from '@playwright/test'
test('app shell loads', async ({ page }) => {
  await page.goto('./')
  await expect(page).toHaveTitle('CapJS')
  await expect(page.locator('#app')).toBeVisible()
})
