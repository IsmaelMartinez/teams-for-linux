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

const LIFECYCLE_METHODS = ['addEventListener', 'removeEventListener', 'close', 'dispatchEvent'];
const CALLBACK_PROPERTIES = ['onclick', 'onclose', 'onerror', 'onshow'];

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
  // Wait for windows to settle
  await new Promise(resolve => setTimeout(resolve, 4000));

  const windows = electronApp.windows();
  // Find a window with a real page (not about:blank)
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
  test('window.Notification is overridden with correct static API', async () => {
    let electronApp, userDataDir;
    try {
      ({ electronApp, userDataDir } = await launchApp('electron'));
      const mainWindow = await getMainWindow(electronApp);
      expect(mainWindow).toBeTruthy();

      await mainWindow.waitForLoadState('load', { timeout: 30000 });

      // Check static API
      const permissionValue = await mainWindow.evaluate(() => window.Notification.permission);
      expect(permissionValue).toBe('granted');

      const requestResult = await mainWindow.evaluate(() => window.Notification.requestPermission());
      expect(requestResult).toBe('granted');
    } finally {
      await cleanup(electronApp, userDataDir);
    }
  });

  test('electron method returns stub with lifecycle methods', async () => {
    let electronApp, userDataDir;
    try {
      ({ electronApp, userDataDir } = await launchApp('electron'));
      const mainWindow = await getMainWindow(electronApp);
      expect(mainWindow).toBeTruthy();

      await mainWindow.waitForLoadState('load', { timeout: 30000 });

      // Create a notification and inspect the returned object
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
    } finally {
      await cleanup(electronApp, userDataDir);
    }
  });

  test('electron stub addEventListener wires up callbacks correctly', async () => {
    let electronApp, userDataDir;
    try {
      ({ electronApp, userDataDir } = await launchApp('electron'));
      const mainWindow = await getMainWindow(electronApp);
      expect(mainWindow).toBeTruthy();

      await mainWindow.waitForLoadState('load', { timeout: 30000 });

      const result = await mainWindow.evaluate(() => {
        const n = new window.Notification('Test', { body: 'test' });
        let clickFired = false;
        let closeFired = false;

        n.addEventListener('click', () => { clickFired = true; });
        n.addEventListener('close', () => { closeFired = true; });

        // Simulate Teams calling onclick/onclose
        if (n.onclick) n.onclick();
        if (n.onclose) n.onclose();

        return { clickFired, closeFired };
      });

      expect(result.clickFired).toBe(true);
      expect(result.closeFired).toBe(true);
    } finally {
      await cleanup(electronApp, userDataDir);
    }
  });

  test('electron stub removeEventListener clears callbacks', async () => {
    let electronApp, userDataDir;
    try {
      ({ electronApp, userDataDir } = await launchApp('electron'));
      const mainWindow = await getMainWindow(electronApp);
      expect(mainWindow).toBeTruthy();

      await mainWindow.waitForLoadState('load', { timeout: 30000 });

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
    } finally {
      await cleanup(electronApp, userDataDir);
    }
  });

  test('electron stub close() triggers onclose callback', async () => {
    let electronApp, userDataDir;
    try {
      ({ electronApp, userDataDir } = await launchApp('electron'));
      const mainWindow = await getMainWindow(electronApp);
      expect(mainWindow).toBeTruthy();

      await mainWindow.waitForLoadState('load', { timeout: 30000 });

      const closeFired = await mainWindow.evaluate(() => {
        const n = new window.Notification('Test', { body: 'test' });
        let fired = false;
        n.addEventListener('close', () => { fired = true; });
        n.close();
        return fired;
      });

      expect(closeFired).toBe(true);
    } finally {
      await cleanup(electronApp, userDataDir);
    }
  });

  test('electron stub fires show event asynchronously', async () => {
    let electronApp, userDataDir;
    try {
      ({ electronApp, userDataDir } = await launchApp('electron'));
      const mainWindow = await getMainWindow(electronApp);
      expect(mainWindow).toBeTruthy();

      await mainWindow.waitForLoadState('load', { timeout: 30000 });

      const showFired = await mainWindow.evaluate(async () => {
        const n = new window.Notification('Test', { body: 'test' });
        let fired = false;
        n.addEventListener('show', () => { fired = true; });
        // Wait for the async setTimeout(0) to fire
        await new Promise(resolve => setTimeout(resolve, 50));
        return fired;
      });

      expect(showFired).toBe(true);
    } finally {
      await cleanup(electronApp, userDataDir);
    }
  });

  test('custom method returns stub with lifecycle methods', async () => {
    let electronApp, userDataDir;
    try {
      ({ electronApp, userDataDir } = await launchApp('custom'));
      const mainWindow = await getMainWindow(electronApp);
      expect(mainWindow).toBeTruthy();

      await mainWindow.waitForLoadState('load', { timeout: 30000 });

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
    } finally {
      await cleanup(electronApp, userDataDir);
    }
  });

  test('web method does not break native Notification lifecycle', async () => {
    let electronApp, userDataDir;
    try {
      ({ electronApp, userDataDir } = await launchApp('web'));
      const mainWindow = await getMainWindow(electronApp);
      expect(mainWindow).toBeTruthy();

      await mainWindow.waitForLoadState('load', { timeout: 30000 });

      // For web method, verify the override exists and returns something
      // (either a real Notification or a bare fallback). The key assertion is
      // that calling new Notification() does not throw.
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
    } finally {
      await cleanup(electronApp, userDataDir);
    }
  });

  test('multiple notifications can be created sequentially', async () => {
    let electronApp, userDataDir;
    try {
      ({ electronApp, userDataDir } = await launchApp('electron'));
      const mainWindow = await getMainWindow(electronApp);
      expect(mainWindow).toBeTruthy();

      await mainWindow.waitForLoadState('load', { timeout: 30000 });

      // This is the core regression test: Teams creates multiple notifications
      // in sequence. If the stub is missing lifecycle methods, Teams' state
      // machine breaks and stops calling new Notification() after the first.
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
    } finally {
      await cleanup(electronApp, userDataDir);
    }
  });
});
