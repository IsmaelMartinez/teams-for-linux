const { defineConfig } = require('@playwright/test');

// Session directories contain live Microsoft auth tokens stored in plaintext
// (--password-store=basic). Never commit session data or use a path outside
// a gitignored directory. The Docker workflow stores sessions in the
// gitignored tests/cross-distro/session/ directory.
if (!process.env.E2E_SESSION_DIR) {
  throw new Error(
    'E2E_SESSION_DIR must be set to a gitignored directory containing a ' +
    'logged-in session. Create one with: cd tests/cross-distro && ./run.sh ubuntu x11 --login'
  );
}

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
    sessionDir: process.env.E2E_SESSION_DIR,
  },
});
