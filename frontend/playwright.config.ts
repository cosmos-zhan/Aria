import { defineConfig } from '@playwright/test';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const python = process.env.PROJECTGRAPH_PYTHON || path.join(root, '.venv/bin/python');
export default defineConfig({
  testDir: './tests',
  timeout: 30000,
  expect: { timeout: 7000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['json', { outputFile: '../artifacts/playwright-results.json' }]],
  use: {
    baseURL: 'http://127.0.0.1:5174',
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: `"${python}" "${root}/scripts/e2e_server.py"`,
      url: 'http://127.0.0.1:8011/api/health',
      reuseExistingServer: false,
      timeout: 30000,
    },
    {
      command: 'npm run dev -- --port 5174',
      url: 'http://127.0.0.1:5174',
      reuseExistingServer: false,
      timeout: 30000,
      env: { PROJECTGRAPH_API_URL: 'http://127.0.0.1:8011' },
    },
  ],
});
