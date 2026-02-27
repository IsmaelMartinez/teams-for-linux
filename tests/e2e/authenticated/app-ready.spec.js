import { test, expect } from '@playwright/test';
import { launchAuthenticatedApp, waitForTeamsWindow, closeApp } from './helpers.js';

test.describe('Authenticated app launch', () => {
  let electronApp;

  test.afterEach(async () => {
    await closeApp(electronApp);
  });

  test('app loads Teams without redirecting to login', async ({}, testInfo) => {
    const sessionDir = testInfo.project.use.sessionDir;
    electronApp = await launchAuthenticatedApp(sessionDir);

    const mainWindow = await waitForTeamsWindow(electronApp);
    expect(mainWindow, 'Main Teams window should exist').toBeTruthy();

    const url = mainWindow.url();
    const hostname = new URL(url).hostname;

    // Should be on a Teams domain, NOT on the login page
    expect(hostname).not.toBe('login.microsoftonline.com');
    expect(
      ['teams.cloud.microsoft', 'teams.microsoft.com', 'teams.live.com']
    ).toContain(hostname);
  });

  test('Teams UI loads to a usable state', async ({}, testInfo) => {
    const sessionDir = testInfo.project.use.sessionDir;
    electronApp = await launchAuthenticatedApp(sessionDir);

    const mainWindow = await waitForTeamsWindow(electronApp);
    expect(mainWindow).toBeTruthy();

    // Teams maintains constant WebSocket activity so networkidle never
    // triggers. Use domcontentloaded instead.
    await mainWindow.waitForLoadState('domcontentloaded', { timeout: 60000 });

    // Verify no crash errors in the page
    const crashIndicators = await mainWindow.locator('text=/something went wrong/i').count();
    expect(crashIndicators, 'No crash indicators should be visible').toBe(0);
  });
});
