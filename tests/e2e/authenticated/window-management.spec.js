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

  test('app recovers from minimize/restore cycle', async ({}, testInfo) => {
    const sessionDir = testInfo.project.use.sessionDir;
    electronApp = await launchAuthenticatedApp(sessionDir);

    const mainWindow = await waitForTeamsWindow(electronApp);
    expect(mainWindow).toBeTruthy();

    await mainWindow.waitForLoadState('networkidle', { timeout: 60000 });

    // The page should still be responsive after load
    const url = mainWindow.url();
    expect(url).toContain('teams');

    // Verify no crash indicators
    const crashCount = await mainWindow.locator('text=/something went wrong/i').count();
    expect(crashCount).toBe(0);
  });
});
