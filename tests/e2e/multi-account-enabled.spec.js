import { test, expect } from '@playwright/test';
import {
  startApp,
  findMainTeamsWindow,
  waitForLoginRedirect,
  getRegisteredHandlers,
  getEventHandlerCounts,
  getContentViewChildBounds,
  invokeHandler,
  closeAndCleanup,
  PROFILE_IPC_CHANNELS,
  SWITCHER_EVENT_CHANNELS,
  SWITCHER_HANDLE_CHANNELS,
  SWITCHER_CHROME_HEIGHT,
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

    // Phase 1c.2: the switcher chrome strip is created when the flag is on.
    // Its open-add / open-manage listeners and the set-expanded invoke handler
    // should all be registered.
    const eventCounts = await getEventHandlerCounts(
      ctx.electronApp,
      SWITCHER_EVENT_CHANNELS
    );
    for (const channel of SWITCHER_EVENT_CHANNELS) {
      expect(
        eventCounts[channel],
        `expected ${channel} listener to be present when multiAccount.enabled is true`
      ).toBeGreaterThan(0);
    }
    const switcherHandlers = await getRegisteredHandlers(
      ctx.electronApp,
      SWITCHER_HANDLE_CHANNELS
    );
    for (const channel of SWITCHER_HANDLE_CHANNELS) {
      expect(switcherHandlers[channel], `expected ${channel} handler`).toBe(
        true
      );
    }

    // With no profiles yet, the only contentView child is the strip itself,
    // pinned full-width across the top at the reserved chrome height, and it
    // actually loaded the switcher renderer.
    const view = await getContentViewChildBounds(ctx.electronApp);
    expect(view).not.toHaveProperty('error');
    expect(view.count).toBe(1);
    const strip = view.bounds[0];
    expect(strip.x).toBe(0);
    expect(strip.y).toBe(0);
    expect(strip.height).toBe(SWITCHER_CHROME_HEIGHT);
    expect(strip.width).toBeGreaterThan(0);
    expect(view.urls[0]).toMatch(/profileSwitcher\/switcher\.html$/);
  } finally {
    await closeAndCleanup(ctx);
  }
});

// Phase 1c.2: switching to a profile view must inset it below the strip and
// keep the strip topmost (the #raiseChrome re-assert after addChildView). This
// is the core z-order/bounds mechanic the strip depends on.
test('switching to a profile view insets it below the strip and keeps the strip topmost', async () => {
  const ctx = await startApp({
    prefix: 'teams-e2e-switch-',
    config: { multiAccount: { enabled: true } },
    allowEval: true,
  });

  try {
    const mainWindow = findMainTeamsWindow(ctx.electronApp);
    expect(mainWindow).toBeTruthy();
    await waitForLoginRedirect(mainWindow);

    // Create two profiles and switch to the second (mirrors the Add dialog,
    // which adds then switches). These go through the real ProfilesManager →
    // ProfileViewManager event path.
    const a = await invokeHandler(ctx.electronApp, 'profile-add', [
      { name: 'Profile A' },
    ]);
    const b = await invokeHandler(ctx.electronApp, 'profile-add', [
      { name: 'Profile B' },
    ]);
    expect(a).toHaveProperty('result');
    expect(b).toHaveProperty('result');
    const switched = await invokeHandler(ctx.electronApp, 'profile-switch', [
      b.result.id,
    ]);
    expect(switched).toHaveProperty('result');

    const view = await getContentViewChildBounds(ctx.electronApp);
    expect(view).not.toHaveProperty('error');
    // Two children: the active profile view + the strip on top.
    expect(view.count).toBe(2);

    // The strip is the LAST (topmost) child, still full-width at the top.
    const strip = view.bounds[view.count - 1];
    expect(strip.x).toBe(0);
    expect(strip.y).toBe(0);
    expect(strip.height).toBe(SWITCHER_CHROME_HEIGHT);
    expect(view.urls[view.count - 1]).toMatch(
      /profileSwitcher\/switcher\.html$/
    );

    // The active profile view is inset below the strip.
    const profileView = view.bounds[0];
    expect(profileView.x).toBe(0);
    expect(profileView.y).toBe(SWITCHER_CHROME_HEIGHT);
    expect(profileView.width).toBe(strip.width);
    expect(profileView.height).toBeGreaterThan(0);
  } finally {
    await closeAndCleanup(ctx);
  }
});
