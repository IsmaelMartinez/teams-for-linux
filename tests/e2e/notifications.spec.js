import { test, expect } from '@playwright/test';
import { _electron as electron } from 'playwright';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Notification lifecycle tests.
 *
 * Verifies that the preload.js Notification override returns objects with
 * the lifecycle methods Teams expects (addEventListener, removeEventListener,
 * close, dispatchEvent). Without these, Teams' internal state machine breaks
 * after the first notification call, causing subsequent ones to silently fail.
 *
 * These tests launch the app with a clean profile (no login session), so they
 * exercise the preload in a real Electron renderer without needing Microsoft
 * authentication. They work both locally and inside Docker cross-distro
 * containers.
 */

async function launchApp(notificationMethod) {
  const userDataDir = mkdtempSync(join(tmpdir(), 'teams-e2e-notif-'));
  const args = [
    './app/index.js',
    `--notificationMethod=${notificationMethod}`,
    ...(process.env.CI ? ['--no-sandbox'] : []),
  ];

  const electronApp = await electron.launch({
    args,
    env: { ...process.env, E2E_USER_DATA_DIR: userDataDir },
    timeout: 30000,
  });

  return { electronApp, userDataDir };
}

async function getMainWindow(electronApp) {
  await electronApp.firstWindow({ timeout: 30000 });
  await new Promise(resolve => setTimeout(resolve, 4000));

  const windows = electronApp.windows();
  return windows.find(w => {
    const url = w.url();
    try {
      const hostname = new URL(url).hostname;
      return hostname === 'teams.cloud.microsoft' ||
        hostname === 'teams.microsoft.com' ||
        hostname === 'teams.live.com' ||
        hostname === 'login.microsoftonline.com';
    } catch {
      return false;
    }
  });
}

async function cleanup(electronApp, userDataDir) {
  if (electronApp) {
    try {
      await Promise.race([
        electronApp.close(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
      ]);
    } catch {
      try {
        const pid = electronApp.process()?.pid;
        if (pid) process.kill(pid, 'SIGKILL');
      } catch { /* ignore */ }
    }
  }
  if (userDataDir) {
    try { rmSync(userDataDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

test.describe('Notification override', () => {

  test.describe('electron method', () => {
    let electronApp, userDataDir, mainWindow;

    test.beforeEach(async () => {
      ({ electronApp, userDataDir } = await launchApp('electron'));
      mainWindow = await getMainWindow(electronApp);
      expect(mainWindow).toBeTruthy();
      await mainWindow.waitForLoadState('load', { timeout: 30000 });
    });

    test.afterEach(async () => {
      await cleanup(electronApp, userDataDir);
    });

    test('window.Notification is overridden with correct static API', async () => {
      const permissionValue = await mainWindow.evaluate(() => window.Notification.permission);
      expect(permissionValue).toBe('granted');

      const requestResult = await mainWindow.evaluate(() => window.Notification.requestPermission());
      expect(requestResult).toBe('granted');
    });

    test('returns stub with lifecycle methods', async () => {
      const stubShape = await mainWindow.evaluate(() => {
        const n = new window.Notification('Test', { body: 'test body' });
        return {
          hasAddEventListener: typeof n.addEventListener === 'function',
          hasRemoveEventListener: typeof n.removeEventListener === 'function',
          hasClose: typeof n.close === 'function',
          hasDispatchEvent: typeof n.dispatchEvent === 'function',
          hasOnclick: 'onclick' in n,
          hasOnclose: 'onclose' in n,
          hasOnerror: 'onerror' in n,
          hasOnshow: 'onshow' in n,
        };
      });

      expect(stubShape.hasAddEventListener).toBe(true);
      expect(stubShape.hasRemoveEventListener).toBe(true);
      expect(stubShape.hasClose).toBe(true);
      expect(stubShape.hasDispatchEvent).toBe(true);
      expect(stubShape.hasOnclick).toBe(true);
      expect(stubShape.hasOnclose).toBe(true);
      expect(stubShape.hasOnerror).toBe(true);
      expect(stubShape.hasOnshow).toBe(true);
    });

    test('addEventListener wires up callbacks correctly', async () => {
      const result = await mainWindow.evaluate(() => {
        const n = new window.Notification('Test', { body: 'test' });
        let clickFired = false;
        let closeFired = false;

        n.addEventListener('click', () => { clickFired = true; });
        n.addEventListener('close', () => { closeFired = true; });

        if (n.onclick) n.onclick();
        if (n.onclose) n.onclose();

        return { clickFired, closeFired };
      });

      expect(result.clickFired).toBe(true);
      expect(result.closeFired).toBe(true);
    });

    test('removeEventListener clears callbacks', async () => {
      const result = await mainWindow.evaluate(() => {
        const n = new window.Notification('Test', { body: 'test' });
        const handler = () => {};

        n.addEventListener('click', handler);
        const hadHandler = n.onclick === handler;

        n.removeEventListener('click', handler);
        const cleared = n.onclick === null;

        return { hadHandler, cleared };
      });

      expect(result.hadHandler).toBe(true);
      expect(result.cleared).toBe(true);
    });

    test('close() triggers onclose callback', async () => {
      const closeFired = await mainWindow.evaluate(() => {
        const n = new window.Notification('Test', { body: 'test' });
        let fired = false;
        n.addEventListener('close', () => { fired = true; });
        n.close();
        return fired;
      });

      expect(closeFired).toBe(true);
    });

    test('fires show event asynchronously', async () => {
      const showFired = await mainWindow.evaluate(async () => {
        const n = new window.Notification('Test', { body: 'test' });
        let fired = false;
        n.addEventListener('show', () => { fired = true; });
        await new Promise(resolve => setTimeout(resolve, 50));
        return fired;
      });

      expect(showFired).toBe(true);
    });

    test('multiple notifications can be created sequentially', async () => {
      const result = await mainWindow.evaluate(() => {
        const stubs = [];
        for (let i = 0; i < 5; i++) {
          const n = new window.Notification(`Test ${i}`, { body: `body ${i}` });
          stubs.push({
            hasAddEventListener: typeof n.addEventListener === 'function',
            hasClose: typeof n.close === 'function',
          });
        }
        return stubs;
      });

      expect(result).toHaveLength(5);
      for (const stub of result) {
        expect(stub.hasAddEventListener).toBe(true);
        expect(stub.hasClose).toBe(true);
      }
    });
  });

  test.describe('custom method', () => {
    let electronApp, userDataDir, mainWindow;

    test.beforeEach(async () => {
      ({ electronApp, userDataDir } = await launchApp('custom'));
      mainWindow = await getMainWindow(electronApp);
      expect(mainWindow).toBeTruthy();
      await mainWindow.waitForLoadState('load', { timeout: 30000 });
    });

    test.afterEach(async () => {
      await cleanup(electronApp, userDataDir);
    });

    test('returns stub with lifecycle methods', async () => {
      const stubShape = await mainWindow.evaluate(() => {
        const n = new window.Notification('Test', { body: 'test body' });
        return {
          hasAddEventListener: typeof n.addEventListener === 'function',
          hasRemoveEventListener: typeof n.removeEventListener === 'function',
          hasClose: typeof n.close === 'function',
          hasDispatchEvent: typeof n.dispatchEvent === 'function',
        };
      });

      expect(stubShape.hasAddEventListener).toBe(true);
      expect(stubShape.hasRemoveEventListener).toBe(true);
      expect(stubShape.hasClose).toBe(true);
      expect(stubShape.hasDispatchEvent).toBe(true);
    });
  });

  test.describe('web method', () => {
    let electronApp, userDataDir, mainWindow;

    test.beforeEach(async () => {
      ({ electronApp, userDataDir } = await launchApp('web'));
      mainWindow = await getMainWindow(electronApp);
      expect(mainWindow).toBeTruthy();
      await mainWindow.waitForLoadState('load', { timeout: 30000 });
    });

    test.afterEach(async () => {
      await cleanup(electronApp, userDataDir);
    });

    test('does not break native Notification lifecycle', async () => {
      const result = await mainWindow.evaluate(() => {
        try {
          const n = new window.Notification('Test', { body: 'test body' });
          return {
            didNotThrow: true,
            type: typeof n,
            hasOnclick: 'onclick' in n,
          };
        } catch (e) {
          return { didNotThrow: false, error: e.message };
        }
      });

      expect(result.didNotThrow).toBe(true);
      expect(result.type).toBe('object');
      expect(result.hasOnclick).toBe(true);
    });
  });
});
