import { defineConfig } from '@playwright/test';
import path from 'path';

export default defineConfig({
  testDir: path.resolve(__dirname),
  timeout: 30000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:3457',
    headless: true,
    viewport: { width: 1440, height: 900 },
    actionTimeout: 5000,
  },
  webServer: [
    {
      command: 'node bechmark/tests/e2e-setup.js',
      cwd: path.resolve(__dirname, '..', '..'),
      port: 3457,
      reuseExistingServer: false,
      timeout: 10000,
    },
  ],
});
