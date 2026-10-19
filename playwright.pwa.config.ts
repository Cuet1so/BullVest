import { defineConfig } from '@playwright/test';
import process from 'node:process';
export default defineConfig({
  testDir: './tests/pwa',
  outputDir: './playwright-report/pwa-artifacts',
  use: { baseURL: 'http://127.0.0.1:4174', channel: process.platform === 'win32' ? 'msedge' : 'chromium', trace: 'retain-on-failure' },
  webServer: { command: 'npm run preview -- --host 127.0.0.1 --port 4174 --strictPort', url: 'http://127.0.0.1:4174', reuseExistingServer: false },
});
