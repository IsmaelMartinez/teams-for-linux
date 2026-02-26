import { test, expect } from '@playwright/test';
import { launchAuthenticatedApp, waitForTeamsWindow, closeApp } from './helpers.js';

test.describe('Screen sharing', () => {
  let electronApp;

  test.afterEach(async () => {
    await closeApp(electronApp);
  });

  test('app starts without screen sharing errors', async ({}, testInfo) => {
    const sessionDir = testInfo.project.use.sessionDir;
    electronApp = await launchAuthenticatedApp(sessionDir);

    const mainWindow = await waitForTeamsWindow(electronApp);
    expect(mainWindow).toBeTruthy();

    // Collect console errors related to screen sharing during load
    const screenShareErrors = [];
    mainWindow.on('console', msg => {
      if (msg.type() === 'error' && msg.text().includes('SCREEN_SHARE')) {
        screenShareErrors.push(msg.text());
      }
    });

    // Wait for Teams to fully load
    await mainWindow.waitForLoadState('networkidle', { timeout: 60000 });

    // App should be alive and responsive
    const title = await mainWindow.title();
    expect(title).toBeTruthy();

    // No screen sharing errors during startup
    expect(screenShareErrors, 'No screen sharing errors in console').toEqual([]);
  });

  test('multiple windows created without crashes', async ({}, testInfo) => {
    const sessionDir = testInfo.project.use.sessionDir;
    electronApp = await launchAuthenticatedApp(sessionDir);

    const mainWindow = await waitForTeamsWindow(electronApp);
    expect(mainWindow).toBeTruthy();

    // The app creates multiple windows (main + toast).
    // Verify all windows are healthy.
    const windows = electronApp.windows();
    expect(windows.length).toBeGreaterThanOrEqual(1);

    for (const win of windows) {
      const url = win.url();
      // Every window should have a valid URL (not about:blank or error)
      expect(url).toBeTruthy();
      expect(url).not.toContain('about:blank');
    }
  });
});
