import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'tests/e2e',
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  use: { baseURL: 'http://localhost:5179/CapJS/' },
  webServer: {
    command: 'npx vite --port 5179 --strictPort',
    url: 'http://localhost:5179/CapJS/',
    reuseExistingServer: !process.env.CI,
  },
})
