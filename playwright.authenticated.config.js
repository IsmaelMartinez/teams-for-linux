const { defineConfig } = require('@playwright/test');
const path = require('node:path');

const sessionDir = process.env.E2E_SESSION_DIR ||
  path.join(__dirname, 'testing', 'spikes', '.test-session');

module.exports = defineConfig({
  testDir: './tests/e2e/authenticated',
  timeout: 90000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: 'list',
  use: {
    trace: 'on-first-retry',
    sessionDir,
  },
});
