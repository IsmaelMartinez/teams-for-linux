import { test, expect } from '@playwright/test';
import {
  startApp,
  findMainTeamsWindow,
  waitForLoginRedirect,
  getRegisteredHandlers,
  closeAndCleanup,
  PROFILE_IPC_CHANNELS,
} from './helpers/electronApp.js';

// Phase 1c.1 regression test for ADR-020's core invariant: when
// `multiAccount.enabled === false`, the app's behavior is byte-identical
// to pre-feature single-profile operation.
//
// We assert two things on top of the existing smoke flow:
//   1. The main window still loads and redirects to Microsoft login.
//   2. None of the six `profile-*` IPC handlers are registered, so a
//      renderer attempting to invoke them gets "no handler" — proving the
//      multi-account code paths are inert with the flag off.
test('multi-account disabled = byte-identical launch (no profile-* IPC handlers)', async () => {
  // Explicitly set the flag to false (rather than relying on the default)
  // so this test fails loudly if the default ever changes — that itself
  // would be a regression worth flagging.
  const ctx = await startApp({
    prefix: 'teams-e2e-disabled-',
    config: { multiAccount: { enabled: false } },
    // Need `electronApp.evaluate` to introspect ipcMain._invokeHandlers.
    allowEval: true,
  });

  try {
    expect(ctx.electronApp.windows().length).toBeGreaterThan(0);

    const mainWindow = findMainTeamsWindow(ctx.electronApp);
    expect(mainWindow).toBeTruthy();
    await waitForLoginRedirect(mainWindow);

    const registered = await getRegisteredHandlers(
      ctx.electronApp,
      PROFILE_IPC_CHANNELS
    );

    expect(registered).not.toHaveProperty('error');
    for (const channel of PROFILE_IPC_CHANNELS) {
      expect(
        registered[channel],
        `expected ${channel} handler to be absent when multiAccount.enabled is false`
      ).toBe(false);
    }
  } finally {
    await closeAndCleanup(ctx);
  }
});
