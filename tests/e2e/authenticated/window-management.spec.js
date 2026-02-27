import { test, expect } from '@playwright/test';
import { launchAuthenticatedApp, waitForTeamsWindow, closeApp } from './helpers.js';

test.describe('Window management', () => {
  let electronApp;

  test.afterEach(async () => {
    await closeApp(electronApp);
  });

  test('main window has a reasonable size', async ({}, testInfo) => {
    const sessionDir = testInfo.project.use.sessionDir;
    electronApp = await launchAuthenticatedApp(sessionDir);

    const mainWindow = await waitForTeamsWindow(electronApp);
    expect(mainWindow).toBeTruthy();

    // Use JavaScript to get the actual window dimensions since
    // Playwright's viewportSize() returns null for Electron windows
    const dimensions = await mainWindow.evaluate(() => ({  // eslint-disable-line no-eval
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
    }));

    expect(dimensions.innerWidth).toBeGreaterThan(400);
    expect(dimensions.innerHeight).toBeGreaterThan(300);
  });

  test('app is responsive and has no crash indicators', async ({}, testInfo) => {
    const sessionDir = testInfo.project.use.sessionDir;
    electronApp = await launchAuthenticatedApp(sessionDir);

    const mainWindow = await waitForTeamsWindow(electronApp);
    expect(mainWindow).toBeTruthy();

    // Teams maintains constant WebSocket activity so networkidle never
    // triggers. Use domcontentloaded instead.
    await mainWindow.waitForLoadState('domcontentloaded', { timeout: 60000 });

    const url = mainWindow.url();
    expect(url).toContain('teams');

    const crashCount = await mainWindow.locator('text=/something went wrong/i').count();
    expect(crashCount).toBe(0);
  });
});
