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
  SWITCHER_PILL_SIZE,
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

    // Phase 1c.2: the switcher pill is created when the flag is on. Its
    // open-add / open-manage listeners and the set-expanded invoke handler
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

    // With no profiles yet, the only contentView child is the switcher pill,
    // a small square flush to the window's bottom-left corner, and it actually
    // loaded the switcher renderer.
    const view = await getContentViewChildBounds(ctx.electronApp);
    expect(view).not.toHaveProperty('error');
    expect(view.count).toBe(1);
    const pill = view.bounds[0];
    expect(pill.x).toBe(0);
    expect(pill.width).toBe(SWITCHER_PILL_SIZE);
    expect(pill.height).toBe(SWITCHER_PILL_SIZE);
    expect(pill.y).toBe(view.contentHeight - SWITCHER_PILL_SIZE);
    expect(view.urls[0]).toMatch(/profileSwitcher\/switcher\.html$/);
  } finally {
    await closeAndCleanup(ctx);
  }
});

// Phase 1c.2: switching to a profile view must fill the content area and keep
// the switcher pill topmost (the #raiseChrome re-assert after addChildView).
test('switching to a profile view fills the window and keeps the pill topmost', async () => {
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
    // Two children: the active profile view + the pill on top.
    expect(view.count).toBe(2);

    // The pill is the LAST (topmost) child, still in the bottom-left corner.
    const pill = view.bounds[view.count - 1];
    expect(pill.x).toBe(0);
    expect(pill.width).toBe(SWITCHER_PILL_SIZE);
    expect(pill.height).toBe(SWITCHER_PILL_SIZE);
    expect(pill.y).toBe(view.contentHeight - SWITCHER_PILL_SIZE);
    expect(view.urls[view.count - 1]).toMatch(
      /profileSwitcher\/switcher\.html$/
    );

    // The active profile view fills the whole content area (no inset).
    const profileView = view.bounds[0];
    expect(profileView.x).toBe(0);
    expect(profileView.y).toBe(0);
    expect(profileView.width).toBe(view.contentWidth);
    expect(profileView.height).toBe(view.contentHeight);
  } finally {
    await closeAndCleanup(ctx);
  }
});
