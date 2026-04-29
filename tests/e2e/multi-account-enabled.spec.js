import { test, expect } from '@playwright/test';
import { _electron as electron } from 'playwright';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Phase 1c.1 regression test for the flag-on path: with no profiles yet
// configured, the app must reach Microsoft login the same way it does
// with the flag off. This catches the case where ProfileViewManager
// initialization or the bootstrap check breaks the startup sequence.
test('multi-account enabled, no profiles yet = same redirect to Microsoft login', async () => {
  let electronApp;
  let userDataDir;

  try {
    userDataDir = mkdtempSync(join(tmpdir(), 'teams-e2e-enabled-'));
    writeFileSync(
      join(userDataDir, 'config.json'),
      JSON.stringify({ multiAccount: { enabled: true } })
    );

    electronApp = await electron.launch({
      args: [
        './app/index.js',
        ...(process.env.CI ? ['--no-sandbox'] : []),
      ],
      env: {
        ...process.env,
        E2E_USER_DATA_DIR: userDataDir,
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

    // With the flag on, the six profile-* handlers SHOULD be registered
    // (the multi-account IPC surface is live).
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
      expect(registered[channel], `expected ${channel} handler to be present when multiAccount.enabled is true`).toBe(true);
    }

    // With no prior cookies on persist:teams-4-linux, the bootstrap heuristic
    // should skip — `app.profiles` stays empty.
    const profilesEmpty = await electronApp.evaluate(({ ipcMain }) => {
      // ipcMain.invoke isn't a real thing; emulate by reaching into the
      // registered handler. Test-only introspection.
      const map = ipcMain._invokeHandlers;
      const handler = map?.get?.('profile-list');
      if (!handler) return { error: 'profile-list handler missing' };
      return handler({}, []).then((list) => ({ list }));
    });
    expect(profilesEmpty).toHaveProperty('list');
    expect(profilesEmpty.list).toEqual([]);
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
