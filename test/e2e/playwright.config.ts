import path from 'node:path'
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: path.resolve(__dirname),
  outputDir: path.resolve(__dirname, '../../output/playwright'),
  timeout: 45_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
})
