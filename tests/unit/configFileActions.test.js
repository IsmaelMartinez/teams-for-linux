const { test, describe, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  openConfigFile,
  openConfigFolder,
} = require("../../app/menus/configFileActions");

function fakeShell() {
  const openedPaths = [];
  return {
    openedPaths,
    openPath: (p) => {
      openedPaths.push(p);
      return Promise.resolve("");
    },
  };
}

describe("configFileActions", () => {
  let configPath;

  beforeEach(() => {
    configPath = fs.mkdtempSync(
      path.join(os.tmpdir(), "teams-for-linux-config-test-")
    );
  });

  afterEach(() => {
    fs.rmSync(configPath, { recursive: true, force: true });
  });

  describe("openConfigFile", () => {
    test("creates a stub config.json when none exists, then opens it", () => {
      const shell = fakeShell();
      const configFilePath = path.join(configPath, "config.json");

      openConfigFile(shell, configPath);

      assert.strictEqual(fs.existsSync(configFilePath), true);
      assert.strictEqual(fs.readFileSync(configFilePath, "utf8"), "{}\n");
      assert.deepStrictEqual(shell.openedPaths, [configFilePath]);
    });

    test("does not overwrite an existing config.json", () => {
      const shell = fakeShell();
      const configFilePath = path.join(configPath, "config.json");
      fs.writeFileSync(configFilePath, '{"url":"https://example.com"}');

      openConfigFile(shell, configPath);

      assert.strictEqual(
        fs.readFileSync(configFilePath, "utf8"),
        '{"url":"https://example.com"}'
      );
      assert.deepStrictEqual(shell.openedPaths, [configFilePath]);
    });

    test("creates the config directory when it doesn't exist yet", () => {
      const shell = fakeShell();
      const nestedConfigPath = path.join(configPath, "nested", "dir");
      const configFilePath = path.join(nestedConfigPath, "config.json");

      openConfigFile(shell, nestedConfigPath);

      assert.strictEqual(fs.existsSync(configFilePath), true);
      assert.deepStrictEqual(shell.openedPaths, [configFilePath]);
    });
  });

  describe("openConfigFolder", () => {
    test("opens the config directory itself", () => {
      const shell = fakeShell();

      openConfigFolder(shell, configPath);

      assert.deepStrictEqual(shell.openedPaths, [configPath]);
    });
  });
});
