import { test, expect } from '@playwright/test';
import { _electron as electron } from 'playwright';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test.describe("WebAuthn FIDO2 Support", () => {
  test("WebAuthn API is available in Electron", async () => {
    let electronApp;
    let userDataDir;

    try {
      userDataDir = mkdtempSync(join(tmpdir(), "t4l-webauthn-test-"));

      electronApp = await electron.launch({
        args: [
          './app/index.js',
          ...(process.env.CI ? ['--no-sandbox'] : [])
        ],
        env: {
          ...process.env,
          E2E_USER_DATA_DIR: userDataDir,
        },
        timeout: 30000,
      });

      const page = await electronApp.firstWindow({ timeout: 30000 });
      await page.waitForLoadState("domcontentloaded");

      const hasPKC = await page.evaluate(() => globalThis.PublicKeyCredential !== undefined);
      expect(hasPKC).toBe(true);

      const hasCreate = await page.evaluate(() => typeof navigator.credentials?.create === "function");
      expect(hasCreate).toBe(true);

      const hasGet = await page.evaluate(() => typeof navigator.credentials?.get === "function");
      expect(hasGet).toBe(true);

    } finally {
      if (electronApp) {
        try {
          const closePromise = electronApp.close();
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Close timeout')), 5000)
          );
          await Promise.race([closePromise, timeoutPromise]);
        } catch {
          try {
            const pid = electronApp.process()?.pid;
            if (pid) process.kill(pid, 'SIGKILL');
          } catch {
            // Ignore kill errors
          }
        }
      }
      if (userDataDir) {
        try {
          rmSync(userDataDir, { recursive: true, force: true });
        } catch {
          // Ignore cleanup errors
        }
      }
    }
  });
});
