import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  timeout: 45_000,
  use: {
    baseURL: 'http://127.0.0.1:4273',
    browserName: 'chromium',
    headless: true,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4273',
    url: 'http://127.0.0.1:4273',
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
