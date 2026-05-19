import { test, expect } from '@playwright/test';
import {
  startApp,
  findMainTeamsWindow,
  waitForLoginRedirect,
  getRegisteredHandlers,
  closeAndCleanup,
  PROFILE_IPC_CHANNELS,
} from './helpers/electronApp.js';

// Phase 1c.1 regression test for the flag-on path: with no profiles yet
// configured, the app must reach Microsoft login the same way it does
// with the flag off. This catches the case where ProfileViewManager
// initialization or the bootstrap check breaks the startup sequence.
test('multi-account enabled, no profiles yet = same redirect to Microsoft login', async () => {
  const ctx = await startApp({
    prefix: 'teams-e2e-enabled-',
    config: { multiAccount: { enabled: true } },
    // Need `electronApp.evaluate` to introspect ipcMain._invokeHandlers
    // and to call the profile-list handler directly.
    allowEval: true,
  });

  try {
    expect(ctx.electronApp.windows().length).toBeGreaterThan(0);

    const mainWindow = findMainTeamsWindow(ctx.electronApp);
    expect(mainWindow).toBeTruthy();
    await waitForLoginRedirect(mainWindow);

    // With the flag on, all six profile-* handlers should be registered.
    const registered = await getRegisteredHandlers(
      ctx.electronApp,
      PROFILE_IPC_CHANNELS
    );
    expect(registered).not.toHaveProperty('error');
    for (const channel of PROFILE_IPC_CHANNELS) {
      expect(
        registered[channel],
        `expected ${channel} handler to be present when multiAccount.enabled is true`
      ).toBe(true);
    }

    // With no prior cookies on persist:teams-4-linux, the bootstrap
    // heuristic should skip — `app.profiles` stays empty.
    const profiles = await ctx.electronApp.evaluate(({ ipcMain }) => {
      const map = ipcMain._invokeHandlers;
      const handler = map?.get?.('profile-list');
      if (!handler) return { error: 'profile-list handler missing' };
      return handler({}, []).then((list) => ({ list }));
    });
    expect(profiles).toHaveProperty('list');
    expect(profiles.list).toEqual([]);
  } finally {
    await closeAndCleanup(ctx);
  }
});
