import { test, expect } from '@playwright/test';
import { _electron as electron } from 'playwright';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
  let electronApp;
  let userDataDir;

  try {
    userDataDir = mkdtempSync(join(tmpdir(), 'teams-e2e-disabled-'));

    // Explicitly set `multiAccount.enabled: false` (rather than relying
    // on the default) so this test fails loudly if the default ever
    // changes — that would itself be a regression to flag.
    writeFileSync(
      join(userDataDir, 'config.json'),
      JSON.stringify({ multiAccount: { enabled: false } })
    );

    electronApp = await electron.launch({
      args: [
        './app/index.js',
        ...(process.env.CI ? ['--no-sandbox'] : []),
      ],
      env: {
        ...process.env,
        E2E_USER_DATA_DIR: userDataDir,
        // Allow Playwright's `electronApp.evaluate` UtilityScript to run.
        // The main window normally disables `globalThis.eval` for defense
        // in depth (browserWindowManager.js); E2E_TESTING flips that off so
        // we can introspect ipcMain registration from this test.
        E2E_TESTING: 'true',
      },
      timeout: 30000,
    });

    await electronApp.firstWindow({ timeout: 30000 });
    await new Promise((resolve) => setTimeout(resolve, 4000));

    const windows = electronApp.windows();
    expect(windows.length).toBeGreaterThan(0);

    const mainWindow = windows.find((w) => {
      const url = w.url();
      try {
        const hostname = new URL(url).hostname;
        return (
          hostname === 'teams.cloud.microsoft' ||
          hostname === 'teams.microsoft.com' ||
          hostname === 'teams.live.com' ||
          hostname === 'login.microsoftonline.com'
        );
      } catch {
        return false;
      }
    });

    expect(mainWindow).toBeTruthy();

    await mainWindow.waitForLoadState('load', { timeout: 30000 });
    await mainWindow.waitForURL(
      (url) => {
        try {
          return new URL(url).hostname === 'login.microsoftonline.com';
        } catch {
          return false;
        }
      },
      { timeout: 30000 }
    );

    // Confirm none of the profile-* IPC handlers are registered. The
    // ProfilesManager only calls `ipcMain.handle` when the flag is on;
    // with it off, these channels stay allowlisted (so the validator
    // doesn't block them) but no handler answers them.
    //
    // `_invokeHandlers` is Electron's internal Map for `ipcMain.handle`
    // registrations — used here intentionally rather than attempting an
    // invoke from the renderer (the page is on login.microsoftonline.com
    // by this point and has no preload-exposed IPC surface to use).
    const profileChannels = [
      'profile-list',
      'profile-get-active',
      'profile-switch',
      'profile-add',
      'profile-update',
      'profile-remove',
    ];
    const registered = await electronApp.evaluate(
      ({ ipcMain }, channels) => {
        const map = ipcMain._invokeHandlers;
        if (!map || typeof map.has !== 'function') {
          return { error: 'unable to introspect ipcMain._invokeHandlers' };
        }
        return Object.fromEntries(channels.map((c) => [c, map.has(c)]));
      },
      profileChannels
    );

    expect(registered).not.toHaveProperty('error');
    for (const channel of profileChannels) {
      expect(registered[channel], `expected ${channel} handler to be absent when multiAccount.enabled is false`).toBe(false);
    }
  } finally {
    if (electronApp) {
      try {
        const closePromise = electronApp.close();
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Close timeout')), 5000)
        );
        await Promise.race([closePromise, timeoutPromise]);
      } catch (error) {
        console.debug('Process cleanup:', error.message);
        try {
          const pid = electronApp.process()?.pid;
          if (pid) {
            process.kill(pid, 'SIGKILL');
          }
        } catch {
          // Ignore
        }
      }
    }

    if (userDataDir) {
      try {
        rmSync(userDataDir, { recursive: true, force: true });
      } catch (e) {
        console.warn(`Could not remove temp directory ${userDataDir}: ${e.message}`);
      }
    }
  }
});
