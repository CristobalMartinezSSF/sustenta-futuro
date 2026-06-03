import { defineConfig, devices } from '@playwright/test'
import path from 'path'

// Landing served locally from static file (production domain shows "Próximamente")
const LANDING_URL = process.env.LANDING_URL ?? 'http://localhost:3999'
const ADMIN_URL   = process.env.ADMIN_URL   ?? 'https://admin-taupe-nu.vercel.app'

const WEB_DIR = path.resolve(__dirname, '../apps/web')

export default defineConfig({
  testDir: './tests',
  timeout: 40_000,
  expect: { timeout: 12_000 },
  fullyParallel: false,
  retries: 1,
  workers: 1,
  reporter: [['html', { open: 'never' }], ['list']],

  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
  },

  webServer: {
    command: `npx serve "${WEB_DIR}" -l 3999 --no-clipboard`,
    url: 'http://localhost:3999',
    reuseExistingServer: true,
    timeout: 15_000,
  },

  projects: [
    {
      name: 'landing',
      testMatch: /0[1-3]-.*\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: LANDING_URL,
      },
    },
    {
      name: 'admin',
      testMatch: /0[4-6]-.*\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: ADMIN_URL,
      },
    },
  ],
})
