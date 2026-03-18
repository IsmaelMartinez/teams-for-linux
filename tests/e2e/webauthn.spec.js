const { test, expect } = require("@playwright/test");
const { _electron: electron } = require("@playwright/test");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

test.describe("WebAuthn FIDO2 Support", () => {
  let app;
  let tmpDir;

  test.beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "t4l-webauthn-test-"));
  });

  test.afterEach(async () => {
    if (app) {
      await app.close();
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test("WebAuthn API is available in Electron", async () => {
    app = await electron.launch({
      args: [path.join(__dirname, "../../app")],
      env: {
        ...process.env,
        E2E_USER_DATA_DIR: tmpDir,
        E2E_TESTING: "true",
      },
    });

    const page = await app.firstWindow();
    await page.waitForLoadState("domcontentloaded");

    const hasPKC = await page.evaluate(() => typeof window.PublicKeyCredential !== "undefined");
    expect(hasPKC).toBe(true);

    const hasCreate = await page.evaluate(() => typeof navigator.credentials?.create === "function");
    expect(hasCreate).toBe(true);

    const hasGet = await page.evaluate(() => typeof navigator.credentials?.get === "function");
    expect(hasGet).toBe(true);
  });
});
