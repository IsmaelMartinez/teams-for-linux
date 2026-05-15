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
// `count: 0` hits the early-return branch in
// `trayIconRenderer.updateActivityCount`, which sends a `tray-update`
// IPC without exercising canvas rendering --- the cheapest signal that
// `init(config, ipcRenderer)` ran correctly.

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

    await mainWindow.evaluate(() => {
      globalThis.dispatchEvent(
        new CustomEvent('unread-count', { detail: { number: 0 } })
      );
    });

    // The renderer dispatches synchronously, but the IPC hop is async.
    // Poll for up to 5 s rather than guessing a fixed delay.
    const captured = await ctx.electronApp.evaluate(async () => {
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline) {
        if (globalThis.__capturedTrayUpdates.length > 0) {
          return globalThis.__capturedTrayUpdates;
        }
        await new Promise((r) => setTimeout(r, 100));
      }
      return globalThis.__capturedTrayUpdates;
    });

    expect(
      captured.length,
      'trayIconRenderer should send a `tray-update` IPC when `unread-count` fires. ' +
        'If this fails, check that `modulesRequiringIpc` in `app/browser/preload.js` ' +
        'still includes "trayIconRenderer" (CLAUDE.md / issue #1902).'
    ).toBeGreaterThan(0);
    expect(captured[0]).toMatchObject({ count: 0 });
  } finally {
    await closeAndCleanup(ctx);
  }
});
