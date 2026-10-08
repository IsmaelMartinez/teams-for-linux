"use strict";

const { describe, it, before, after, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { applyRenamedOptions } = require("../../app/config/renames");

const configModulePath = require.resolve("../../app/config");
const storeModulePath = require.resolve("electron-store");
const appConfigurationPath = require.resolve("../../app/appConfiguration");
let AppConfiguration;
let directory;
let originalConfigModule;
let originalStoreModule;
const watchedConfigs = new WeakSet();

// Keep the configuration parser and electron-store outside these filesystem
// tests. The actual rename projection is retained so restart compatibility with
// both supported config spellings is tested rather than assumed.
function loadConfig(configPath) {
  let raw = {};
  try {
    raw = JSON.parse(fs.readFileSync(path.join(configPath, "config.json"), "utf8"));
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) raw = {};
  } catch {
    // Mirrors the real loader's non-fatal handling of unusable user config.
  }
  const config = {
    ...raw,
    customCSSName: raw.customCSSName ?? "",
    customCSSLocation: raw.customCSSLocation ?? "",
    appearance: {
      cssName: "",
      cssLocation: "",
      followSystemTheme: false,
      ...(raw.appearance && typeof raw.appearance === "object" ? raw.appearance : {}),
    },
  };
  applyRenamedOptions(config, raw);
  if (raw.watchConfigFile && fs.existsSync(path.join(configPath, "config.json"))) watchedConfigs.add(config);
  return config;
}
loadConfig.getConfigFilePath = (configPath) => path.join(configPath, "config.json");
loadConfig.isWatchingConfigFile = (config) => watchedConfigs.has(config);

before(() => {
  originalConfigModule = require.cache[configModulePath];
  originalStoreModule = require.cache[storeModulePath];
  require.cache[configModulePath] = { id: configModulePath, filename: configModulePath, loaded: true, exports: loadConfig };
  require.cache[storeModulePath] = { id: storeModulePath, filename: storeModulePath, loaded: true, exports: { default: class {} } };
  delete require.cache[appConfigurationPath];
  ({ AppConfiguration } = require(appConfigurationPath));
});

after(() => {
  delete require.cache[appConfigurationPath];
  if (originalConfigModule) require.cache[configModulePath] = originalConfigModule;
  else delete require.cache[configModulePath];
  if (originalStoreModule) require.cache[storeModulePath] = originalStoreModule;
  else delete require.cache[storeModulePath];
});

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "teams-theme-selection-"));
  const themeDirectory = path.join(directory, "themes", "glass-dark");
  fs.mkdirSync(themeDirectory, { recursive: true });
  fs.writeFileSync(path.join(themeDirectory, "theme.json"), JSON.stringify({ id: "glass-dark", name: "Glass Dark", css: "theme.css" }));
  fs.writeFileSync(path.join(themeDirectory, "theme.css"), "body { color: #eee; }\n");
});

afterEach(() => fs.rmSync(directory, { recursive: true, force: true }));

function writeConfig(contents) {
  fs.writeFileSync(path.join(directory, "config.json"), typeof contents === "string" ? contents : `${JSON.stringify(contents, null, 2)}\n`);
}

function readConfig() {
  return JSON.parse(fs.readFileSync(path.join(directory, "config.json"), "utf8"));
}

function createConfiguration() {
  return new AppConfiguration(directory, "2.24.0");
}

describe("AppConfiguration theme selection persistence", () => {
  it("creates a config file with only explicit theme settings when none exists", () => {
    const config = createConfiguration();
    assert.strictEqual(config.setThemeSelection("compactDark"), true);
    assert.deepStrictEqual(readConfig(), { appearance: { cssName: "compactDark" } });
    assert.strictEqual(fs.statSync(config.configFilePath).mode & 0o777, 0o600);
  });

  it("preserves unrelated config and appearance settings while selecting a custom theme", () => {
    const original = {
      mqtt: { enabled: true, brokerUrl: "mqtt://example.invalid", nested: { token: "preserve" } },
      window: { menubar: "auto" },
      appearance: { cssName: "compactDark", cssLocation: "/existing/direct.css", followSystemTheme: true },
    };
    writeConfig(original);
    const config = createConfiguration();
    assert.strictEqual(config.setThemeSelection("custom:glass-dark"), true);
    assert.deepStrictEqual(readConfig(), {
      ...original,
      appearance: { ...original.appearance, cssName: "custom:glass-dark" },
    });
    assert.deepStrictEqual(config.themeSelection, { cssName: "custom:glass-dark", cssLocation: "/existing/direct.css" });
  });

  it("does not rewrite existing built-in configuration at startup", () => {
    const contents = '{ "appearance": { "cssName": "condensedDark" }, "appTitle": "Preserve" }\n';
    writeConfig(contents);
    const config = createConfiguration();
    assert.strictEqual(config.themeSelection.cssName, "condensedDark");
    assert.strictEqual(fs.readFileSync(config.configFilePath, "utf8"), contents);
  });

  it("retains aliases verbatim and persists canonical values that win after restart", () => {
    const original = { customCSSName: "compactLight", customCSSLocation: "/legacy/direct.css", followSystemTheme: true };
    writeConfig(original);
    const config = createConfiguration();
    assert.deepStrictEqual(config.themeSelection, { cssName: "compactLight", cssLocation: "/legacy/direct.css" });
    config.setThemeSelection("custom:glass-dark");
    assert.deepStrictEqual(readConfig(), {
      ...original,
      appearance: { cssName: "custom:glass-dark" },
    });
    assert.deepStrictEqual(createConfiguration().themeSelection, { cssName: "custom:glass-dark", cssLocation: "/legacy/direct.css" });
  });

  it("switches from built-in to custom and back without mutating startup CSS", () => {
    writeConfig({ appearance: { cssName: "compactDark" } });
    const config = createConfiguration();
    const startup = structuredClone(config.startupConfig);
    const originalCss = config.customCSSPath;
    config.setThemeSelection("custom:glass-dark");
    assert.deepStrictEqual(config.startupConfig, startup);
    assert.strictEqual(config.customCSSPath, originalCss);
    const restarted = createConfiguration();
    assert.strictEqual(restarted.themeSelection.cssName, "custom:glass-dark");
    assert.strictEqual(restarted.customCSSPath, path.join(directory, "themes", "glass-dark", "theme.css"));
    restarted.setThemeSelection("condensedLight");
    assert.strictEqual(createConfiguration().themeSelection.cssName, "condensedLight");
    assert.match(createConfiguration().customCSSPath, /condensedLight\.css$/);
  });

  it("clears both CSS settings for Default and suppresses inherited aliases on restart", () => {
    writeConfig({ customCSSName: "compactDark", customCSSLocation: "/legacy/direct.css" });
    const config = createConfiguration();
    config.setThemeSelection("");
    assert.deepStrictEqual(readConfig(), {
      customCSSName: "compactDark",
      customCSSLocation: "/legacy/direct.css",
      appearance: { cssName: "", cssLocation: "" },
    });
    const restarted = createConfiguration();
    assert.deepStrictEqual(restarted.themeSelection, { cssName: "", cssLocation: "" });
    assert.strictEqual(restarted.customCSSPath, null);
  });

  it("can return from a built-in theme to the configured direct CSS file", () => {
    writeConfig({ appearance: { cssName: "compactDark", cssLocation: "/existing/direct.css" } });
    const config = createConfiguration();
    config.setThemeSelection(null);
    assert.deepStrictEqual(readConfig().appearance, { cssName: "", cssLocation: "/existing/direct.css" });
    assert.strictEqual(createConfiguration().customCSSPath, "/existing/direct.css");
  });

  it("rereads current file contents so externally edited settings are preserved", () => {
    writeConfig({ appearance: { cssLocation: "/old.css" }, window: { menubar: "auto" } });
    const config = createConfiguration();
    writeConfig({ appearance: { cssLocation: "/new.css", followSystemTheme: true }, window: { menubar: "hidden" } });
    config.setThemeSelection("custom:glass-dark");
    assert.deepStrictEqual(readConfig(), {
      appearance: { cssName: "custom:glass-dark", cssLocation: "/new.css", followSystemTheme: true },
      window: { menubar: "hidden" },
    });
  });

  it("returns false and avoids rewriting the file when the selection is already persisted", () => {
    const contents = '{ "appearance": { "cssName": "compactDark", "cssLocation": "" } }\n';
    writeConfig(contents);
    const config = createConfiguration();
    assert.strictEqual(config.setThemeSelection("compactDark"), false);
    assert.strictEqual(fs.readFileSync(config.configFilePath, "utf8"), contents);
  });

  it("preserves existing config file permissions", () => {
    writeConfig({ appearance: { cssName: "compactDark" } });
    fs.chmodSync(path.join(directory, "config.json"), 0o640);
    createConfiguration().setThemeSelection("custom:glass-dark");
    assert.strictEqual(fs.statSync(path.join(directory, "config.json")).mode & 0o777, 0o640);
  });

  it("leaves the original config and pending selection intact if atomic replacement fails", () => {
    const contents = '{ "appearance": { "cssName": "compactDark" }, "appTitle": "Preserve" }\n';
    writeConfig(contents);
    const config = createConfiguration();
    const previousSelection = config.themeSelection;
    const originalRename = fs.renameSync;
    try {
      fs.renameSync = () => { throw new Error("Simulated write failure"); };
      assert.throws(() => config.setThemeSelection("custom:glass-dark"));
    } finally {
      fs.renameSync = originalRename;
    }
    assert.strictEqual(fs.readFileSync(config.configFilePath, "utf8"), contents);
    assert.deepStrictEqual(config.themeSelection, previousSelection);
    assert.deepStrictEqual(fs.readdirSync(directory).sort(), ["config.json", "themes"]);
  });

  it("cleans up its temporary file after a partial write fails", (t) => {
    const contents = '{ "appearance": { "cssName": "compactDark" } }\n';
    writeConfig(contents);
    const config = createConfiguration();
    const previousSelection = config.themeSelection;
    const failure = Object.assign(new Error("Partial write failed"), { code: "ENOSPC" });
    const originalWrite = fs.writeFileSync;
    t.mock.method(fs, "writeFileSync", (file, _data, options) => {
      originalWrite(file, "partial", options);
      throw failure;
    });

    assert.throws(() => config.setThemeSelection("custom:glass-dark"), failure);

    assert.strictEqual(fs.readFileSync(config.configFilePath, "utf8"), contents);
    assert.deepStrictEqual(config.themeSelection, previousSelection);
    assert.deepStrictEqual(fs.readdirSync(directory).sort(), ["config.json", "themes"]);
  });

  it("preserves a pre-existing file if the temporary filename collides", (t) => {
    const contents = '{ "appearance": { "cssName": "compactDark" } }\n';
    writeConfig(contents);
    const config = createConfiguration();
    const previousSelection = config.themeSelection;
    const timestamp = 123;
    t.mock.method(Date, "now", () => timestamp);
    const collision = path.join(directory, `.config-theme-${process.pid}-${timestamp}.tmp`);
    fs.writeFileSync(collision, "existing file");

    assert.throws(() => config.setThemeSelection("custom:glass-dark"), { code: "EEXIST" });

    assert.strictEqual(fs.readFileSync(collision, "utf8"), "existing file");
    assert.strictEqual(fs.readFileSync(config.configFilePath, "utf8"), contents);
    assert.deepStrictEqual(config.themeSelection, previousSelection);
  });

  it("updates symlinked dotfile contents without replacing the config symlink", () => {
    const target = path.join(directory, "managed-config.json");
    fs.writeFileSync(target, JSON.stringify({ appearance: { cssName: "compactDark" }, appTitle: "Preserve" }));
    fs.symlinkSync(target, path.join(directory, "config.json"));
    const config = createConfiguration();
    config.setThemeSelection("custom:glass-dark");
    assert.strictEqual(fs.lstatSync(config.configFilePath).isSymbolicLink(), true);
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(target, "utf8")), {
      appearance: { cssName: "custom:glass-dark" },
      appTitle: "Preserve",
    });
  });

  it("refuses malformed JSON and non-object config or appearance without losing data", () => {
    for (const contents of ['{invalid', 'null', '[]', '{"appearance":"occupied"}', '{"appearance":null}', '{"appearance":[]}']) {
      writeConfig(contents);
      const config = createConfiguration();
      const previousSelection = config.themeSelection;
      assert.throws(() => config.setThemeSelection("compactDark"));
      assert.strictEqual(fs.readFileSync(config.configFilePath, "utf8"), contents);
      assert.deepStrictEqual(config.themeSelection, previousSelection);
    }
  });

  it("rejects selections outside the registered built-in and discovered custom themes", () => {
    writeConfig({});
    const config = createConfiguration();
    for (const value of ["unknown", "custom:missing", "../escape", "builtin:compactDark", {}, 1]) {
      assert.throws(() => config.setThemeSelection(value));
      assert.deepStrictEqual(readConfig(), {});
    }
  });

  it("distinguishes a requested config watcher from an actually installed watcher", () => {
    writeConfig({ watchConfigFile: true });
    const config = createConfiguration();
    assert.strictEqual(config.startupConfig.watchConfigFile, true);
    assert.strictEqual(config.isWatchingConfigFile, true);
    watchedConfigs.delete(config.startupConfig);
    assert.strictEqual(config.startupConfig.watchConfigFile, true);
    assert.strictEqual(config.isWatchingConfigFile, false);
  });
});
