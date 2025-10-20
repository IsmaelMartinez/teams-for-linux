import { test, expect } from '@playwright/test';
import { _electron as electron } from 'playwright';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('app launches and redirects to Microsoft login', async () => {
  let electronApp;
  let userDataDir;

  try {
    // Create a temporary userData directory for this test run (ensures clean state)
    userDataDir = mkdtempSync(join(tmpdir(), 'teams-e2e-'));

    electronApp = await electron.launch({
      args: [
        './app/index.js',
        // Disable sandbox in CI environments (required for GitHub Actions)
        ...(process.env.CI ? ['--no-sandbox'] : [])
      ],
      env: {
        ...process.env,
        E2E_USER_DATA_DIR: userDataDir
      },
      timeout: 30000
    });

    // Wait for windows to be created
    await electronApp.firstWindow({ timeout: 30000 });

    // Give the app a moment to create all windows and start loading
    await new Promise(resolve => setTimeout(resolve, 4000));

    // Get all windows and find the main Teams window
    const windows = electronApp.windows();
    expect(windows.length).toBeGreaterThan(0);

    // Find the main window (not the toast window)
    const mainWindow = windows.find(w => {
      const url = w.url();
      try {
        const hostname = new URL(url).hostname;
        return hostname === 'teams.microsoft.com' ||
               hostname === 'teams.live.com' ||
               hostname === 'login.microsoftonline.com';
      } catch (error) {
        // Invalid URL format, skip this window
        console.debug('Invalid URL in window:', url, error.message);
        return false;
      }
    });

    expect(mainWindow).toBeTruthy();

    // Wait for the initial page load
    await mainWindow.waitForLoadState('load', { timeout: 30000 });

    // Since we're starting with a clean state, the app will redirect to login
    // Wait for the redirect to Microsoft login page
    await mainWindow.waitForURL(url => {
      try {
        return new URL(url).hostname === 'login.microsoftonline.com';
      } catch {
        return false;
      }
    }, { timeout: 30000 });

    // Verify we reached the login page
    const url = mainWindow.url();
    expect(new URL(url).hostname).toBe('login.microsoftonline.com');

    // Wait for the login page to be fully loaded
    await mainWindow.waitForLoadState('networkidle', { timeout: 30000 });

  } finally {
    // Force kill the app if it exists
    if (electronApp) {
      try {
        electronApp.process().kill('SIGTERM');
        // Wait a moment for the process to fully terminate
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        // Process may have already exited, which is fine
        console.debug('Process cleanup:', error.message);
      }
    }

    // Clean up the temporary userData directory
    if (userDataDir) {
      try {
        rmSync(userDataDir, { recursive: true, force: true });
      } catch (e) {
        // Ignore cleanup errors (may still be in use on some systems)
        console.warn(`Could not remove temp directory ${userDataDir}: ${e.message}`);
      }
    }
  }
});
