// @ts-check
const { defineConfig } = require('@playwright/test');

// BASE_URL : 公開済みのサイトに対して実行する場合に指定 (ローカルサーバーは起動しない)
// LOCAL_URL: DIST_DIR を配信するローカルサーバーの URL (既定: http://127.0.0.1:4173/drawio-poc/)
const baseURL = process.env.BASE_URL || process.env.LOCAL_URL || 'http://127.0.0.1:4173/drawio-poc/';
const origin = new URL(baseURL);

module.exports = defineConfig({
  testDir: 'tests',
  testMatch: '*.spec.js',
  timeout: 120_000,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'test-results/report' }]],
  outputDir: 'test-results/artifacts',
  use: {
    baseURL,
    acceptDownloads: true,
    viewport: { width: 1400, height: 900 },
    locale: 'ja-JP',
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: process.env.BASE_URL ? undefined : {
    command: 'node tests/serve.mjs',
    url: baseURL,
    reuseExistingServer: true,
    env: {
      BASE_PATH: origin.pathname,
      PORT: origin.port,
      DIST_DIR: process.env.DIST_DIR || 'dist',
    },
  },
});
