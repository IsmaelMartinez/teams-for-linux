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
  const electronApp = await electron.launch({
    args: [
      './app/index.js',
      `--notificationMethod=${notificationMethod}`,
      ...(process.env.CI ? ['--no-sandbox'] : []),
    ],
    env: { ...process.env, E2E_USER_DATA_DIR: userDataDir },
    timeout: 30000,
  });
  return { electronApp, userDataDir };
}

const TEAMS_HOSTNAMES = new Set(['teams.cloud.microsoft', 'teams.microsoft.com',
  'teams.live.com', 'login.microsoftonline.com']);

async function getMainWindow(electronApp) {
  await electronApp.firstWindow({ timeout: 30000 });
  const deadline = Date.now() + 30000;

  while (Date.now() < deadline) {
    const mainWindow = electronApp.windows().find(w => {
      try { return TEAMS_HOSTNAMES.has(new URL(w.url()).hostname); }
      catch { return false; }
    });
    if (mainWindow) return mainWindow;
    await new Promise(resolve => setTimeout(resolve, 250));
  }

  return null;
}

async function cleanup(electronApp, userDataDir) {
  if (electronApp) {
    try {
      await Promise.race([
        electronApp.close(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
      ]);
    } catch {
      try { if (electronApp.process()?.pid) process.kill(electronApp.process().pid, 'SIGKILL'); }
      catch { /* ignore */ }
    }
  }
  if (userDataDir) {
    try { rmSync(userDataDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

// Shared browser-side function to inspect a Notification stub's shape.
// Serialised as a string so it can be passed to evaluate() without duplication.
function checkStubShape() {
  const n = new globalThis.Notification('Test', { body: 'test body' });
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
}

// Factory: creates a describe block for a given notificationMethod with
// shared beforeEach (launch app) and afterEach (cleanup).  Returns the
// mainWindow via a context object so individual tests stay concise.
function describeMethod(method, testsFn) {
  test.describe(`${method} method`, () => {
    const ctx = {};

    test.beforeEach(async () => {
      const { electronApp, userDataDir } = await launchApp(method);
      Object.assign(ctx, { electronApp, userDataDir });
      ctx.mainWindow = await getMainWindow(electronApp);
      expect(ctx.mainWindow).toBeTruthy();
      await ctx.mainWindow.waitForLoadState('load', { timeout: 30000 });
    });

    test.afterEach(async () => {
      await cleanup(ctx.electronApp, ctx.userDataDir);
    });

    testsFn(ctx);
  });
}

test.describe('Notification override', () => {

  describeMethod('electron', (ctx) => {
    test('Notification is overridden with correct static API', async () => {
      const permissionValue = await ctx.mainWindow.evaluate(() => globalThis.Notification.permission);
      expect(permissionValue).toBe('granted');

      const requestResult = await ctx.mainWindow.evaluate(() => globalThis.Notification.requestPermission());
      expect(requestResult).toBe('granted');
    });

    test('returns stub with all lifecycle methods and callbacks', async () => {
      const shape = await ctx.mainWindow.evaluate(checkStubShape);
      for (const value of Object.values(shape)) {
        expect(value).toBe(true);
      }
    });

    test('addEventListener wires up callbacks correctly', async () => {
      const result = await ctx.mainWindow.evaluate(() => {
        const n = new globalThis.Notification('Test', { body: 'test' });
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
      const result = await ctx.mainWindow.evaluate(() => {
        const n = new globalThis.Notification('Test', { body: 'test' });
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
      const closeFired = await ctx.mainWindow.evaluate(() => {
        const n = new globalThis.Notification('Test', { body: 'test' });
        let fired = false;
        n.addEventListener('close', () => { fired = true; });
        n.close();
        return fired;
      });

      expect(closeFired).toBe(true);
    });

    test('fires show event asynchronously', async () => {
      const showFired = await ctx.mainWindow.evaluate(async () => {
        const n = new globalThis.Notification('Test', { body: 'test' });
        let fired = false;
        n.addEventListener('show', () => { fired = true; });
        await new Promise(resolve => setTimeout(resolve, 50));
        return fired;
      });

      expect(showFired).toBe(true);
    });

    test('multiple notifications can be created sequentially', async () => {
      const result = await ctx.mainWindow.evaluate(() => {
        const stubs = [];
        for (let i = 0; i < 5; i++) {
          const n = new globalThis.Notification(`Test ${i}`, { body: `body ${i}` });
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

  describeMethod('custom', (ctx) => {
    test('returns stub with lifecycle methods', async () => {
      const shape = await ctx.mainWindow.evaluate(checkStubShape);
      expect(shape.hasAddEventListener).toBe(true);
      expect(shape.hasRemoveEventListener).toBe(true);
      expect(shape.hasClose).toBe(true);
      expect(shape.hasDispatchEvent).toBe(true);
    });
  });

  describeMethod('web', (ctx) => {
    test('does not break native Notification lifecycle', async () => {
      const result = await ctx.mainWindow.evaluate(() => {
        try {
          const n = new globalThis.Notification('Test', { body: 'test body' });
          return { didNotThrow: true, type: typeof n, hasOnclick: 'onclick' in n };
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
