import { test, expect } from '@playwright/test';
import {
  startApp,
  findMainTeamsWindow,
  waitForLoginRedirect,
  closeAndCleanup,
} from './helpers/electronApp.js';

// Integration regression check for issue #1902 (CLAUDE.md "Modules
// Requiring IPC Initialization"). The static guard in
// `tests/unit/preloadModules.test.js` asserts that `trayIconRenderer`
// stays in the `modulesRequiringIpc` Set in `app/browser/preload.js`.
// This test exercises the runtime consequence end-to-end: if the module
// is not initialised with `ipcRenderer`, `this.ipcRenderer` is undefined
// and the `unread-count` event handler throws before any IPC is sent.
//
// A non-zero count is dispatched first: since the login page title has
// no `(N)` prefix, only a zero can have been dispatched during startup
// (the head-wide title observer fires on the login page), so a non-zero
// value is never swallowed by `updateActivityCount`'s deduplication.
// The follow-up zero asserts the clear-to-zero path (#2620) lands too.

test('preload passes ipcRenderer to trayIconRenderer (regression #1902)', async () => {
  // `allowEval: true` sets E2E_TESTING=true so `electronApp.evaluate`
  // can install an ipcMain listener on the main process. Same pattern
  // as `multi-account-disabled.spec.js`.
  const ctx = await startApp({
    prefix: 'teams-e2e-preload-tray-',
    allowEval: true,
  });

  try {
    const mainWindow = findMainTeamsWindow(ctx.electronApp);
    expect(mainWindow).toBeTruthy();
    await waitForLoginRedirect(mainWindow);

    // Capture `tray-update` payloads on the main process. `ipcMain.on`
    // permits multiple listeners, so this coexists with the app's
    // production handler.
    await ctx.electronApp.evaluate(({ ipcMain }) => {
      globalThis.__capturedTrayUpdates = [];
      ipcMain.on('tray-update', (_event, payload) => {
        globalThis.__capturedTrayUpdates.push(payload);
      });
    });

    // The renderer dispatches synchronously, but icon rendering and the
    // IPC hop are async. Poll up to 15 s for a `tray-update` carrying the
    // target count at or after `fromIndex` --- successful runs return on
    // the first iterations; the generous deadline only matters on slow CI
    // runners. Index-based matching tolerates stray zero updates from the
    // login page's own title changes.
    const waitForTrayUpdate = (targetCount, fromIndex) =>
      ctx.electronApp.evaluate(async (_electron, args) => {
        const deadline = Date.now() + 15000;
        let index = -1;
        while (Date.now() < deadline) {
          index = globalThis.__capturedTrayUpdates.findIndex(
            (payload, i) => i >= args.fromIndex && payload.count === args.targetCount
          );
          if (index !== -1) {
            break;
          }
          await new Promise((r) => setTimeout(r, 100));
        }
        return { index, captured: globalThis.__capturedTrayUpdates };
      }, { targetCount, fromIndex });

    await mainWindow.evaluate(() => {
      globalThis.dispatchEvent(
        new CustomEvent('unread-count', { detail: { number: 2 } })
      );
    });

    const first = await waitForTrayUpdate(2, 0);
    expect(
      first.index,
      'trayIconRenderer should send a `tray-update` IPC when `unread-count` fires. ' +
        'If this fails, check that `modulesRequiringIpc` in `app/browser/preload.js` ' +
        'still includes "trayIconRenderer" (CLAUDE.md / issue #1902).'
    ).toBeGreaterThanOrEqual(0);
    expect(first.captured[first.index]).toMatchObject({ count: 2 });

    // Clear-to-zero must produce a follow-up tray-update (#2620)
    await mainWindow.evaluate(() => {
      globalThis.dispatchEvent(
        new CustomEvent('unread-count', { detail: { number: 0 } })
      );
    });

    const second = await waitForTrayUpdate(0, first.index + 1);
    expect(
      second.index,
      'trayIconRenderer should send a `tray-update` clearing the badge (#2620).'
    ).toBeGreaterThan(first.index);
    expect(second.captured[second.index]).toMatchObject({ count: 0, icon: null });
  } finally {
    await closeAndCleanup(ctx);
  }
});
