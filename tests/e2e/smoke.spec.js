import { test, expect } from '@playwright/test';
import {
  startApp,
  findMainTeamsWindow,
  waitForLoginRedirect,
  closeAndCleanup,
} from './helpers/electronApp.js';

test('app launches and redirects to Microsoft login', async () => {
  const ctx = await startApp({ prefix: 'teams-e2e-' });

  try {
    expect(ctx.electronApp.windows().length).toBeGreaterThan(0);

    const mainWindow = findMainTeamsWindow(ctx.electronApp);
    expect(mainWindow).toBeTruthy();

    await waitForLoginRedirect(mainWindow);

    expect(new URL(mainWindow.url()).hostname).toBe('login.microsoftonline.com');

    // Wait for the login page to be fully loaded
    await mainWindow.waitForLoadState('networkidle', { timeout: 30000 });
  } finally {
    await closeAndCleanup(ctx);
  }
});
