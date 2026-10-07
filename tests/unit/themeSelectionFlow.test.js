"use strict";

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { EventEmitter } = require("node:events");
const { applyRenamedOptions } = require("../../app/config/renames");

const originals = new Map();
const menusPath = require.resolve("../../app/menus");
const appMenuPath = require.resolve("../../app/menus/appMenu");
const appConfigurationPath = require.resolve("../../app/appConfiguration");
let Menus;
let AppConfiguration;

// Keep native Electron and unrelated windows out of these tests, while using
// the real menu builders, menu attachment and theme persistence methods.
class TestMenu {
  constructor(items = []) {
    this.items = items.map((item) => ({
      ...item,
      ...(item.submenu ? { submenu: new TestMenu(item.submenu) } : {}),
    }));
  }

  static buildFromTemplate(template) {
    return new TestMenu(template);
  }
}

const app = new EventEmitter();
const dialog = {};

function loadConfig(configPath) {
  const raw = JSON.parse(fs.readFileSync(path.join(configPath, "config.json"), "utf8"));
  const config = {
    ...raw,
    customCSSName: raw.customCSSName ?? "",
    customCSSLocation: raw.customCSSLocation ?? "",
    appearance: { cssName: "", cssLocation: "", ...raw.appearance },
  };
  applyRenamedOptions(config, raw);
  return config;
}
loadConfig.getConfigFilePath = (configPath) => path.join(configPath, "config.json");
loadConfig.isWatchingConfigFile = () => false;

function replaceModule(name, exports) {
  const modulePath = require.resolve(name);
  originals.set(modulePath, require.cache[modulePath]);
  require.cache[modulePath] = { id: modulePath, filename: modulePath, loaded: true, exports };
}

before(() => {
  replaceModule("electron", { app, Menu: TestMenu, dialog, ipcMain: new EventEmitter(), shell: {} });
  replaceModule("electron-store", { default: class {} });
  replaceModule("../../app/config", loadConfig);
  for (const name of [
    "../../app/menus/tray",
    "../../app/browser/tools/trayIconChooser",
    "../../app/documentationWindow",
    "../../app/gpuInfoWindow",
    "../../app/joinMeetingDialog",
    "../../app/profileDialogs/addProfile",
    "../../app/profileDialogs/manageProfile",
  ]) replaceModule(name, class {});
  replaceModule("../../app/spellCheckProvider", { SpellCheckProvider: class {} });
  replaceModule("../../app/autoUpdater", {});
  for (const modulePath of [menusPath, appMenuPath, appConfigurationPath]) {
    originals.set(modulePath, require.cache[modulePath]);
    delete require.cache[modulePath];
  }
  Menus = require(menusPath);
  ({ AppConfiguration } = require(appConfigurationPath));
});

after(() => {
  for (const [modulePath, original] of originals) {
    if (original) require.cache[modulePath] = original;
    else delete require.cache[modulePath];
  }
});

function createContext(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "teams-theme-menu-flow-"));
  t.after(() => {
    app.removeAllListeners();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const themeDirectory = path.join(directory, "themes", "glass-dark");
  fs.mkdirSync(themeDirectory, { recursive: true });
  fs.writeFileSync(path.join(themeDirectory, "theme.json"), JSON.stringify({
    id: "glass-dark", name: "Glass Dark", css: "theme.css",
  }));
  fs.writeFileSync(path.join(themeDirectory, "theme.css"), "body { color: #eee; }\n");
  const configFile = path.join(directory, "config.json");
  fs.writeFileSync(configFile, JSON.stringify({
    appearance: { cssName: "compactDark", followSystemTheme: false },
    window: { menubar: "auto" },
    appTitle: "Preserve",
  }));
  dialog.showMessageBox = t.mock.fn(async () => ({ response: 1 }));
  dialog.showErrorBox = t.mock.fn();
  app.relaunch = t.mock.fn();
  app.exit = t.mock.fn();
  const warning = t.mock.method(console, "warn", () => {});
  const window = new EventEmitter();
  window.webContents = new EventEmitter();
  window.webContents.send = t.mock.fn();
  window.setMenu = t.mock.fn((menu) => { window.menu = menu; });
  const configuration = new AppConfiguration(directory, "2.24.0");
  const menus = new Menus(window, configuration, "", {});
  return { directory, configFile, configuration, menus, window, warning };
}

function themeMenu(context) {
  const application = context.window.menu.items[0];
  const settings = application.submenu.items.find((item) => item.label === "Settings");
  return settings.submenu.items.find((item) => item.label === "Theme").submenu;
}

function checkedLabels(context) {
  return themeMenu(context).items.flatMap((item) =>
    (item.submenu?.items ?? [item]).filter((entry) => entry.checked).map((entry) => entry.label));
}

function toggleTheme(context, group, label) {
  const item = themeMenu(context).items.find((entry) => entry.label === group)
    .submenu.items.find((entry) => entry.label === label);
  assert.ok(item, "requested theme is present in the attached menu");
  // Electron toggles a native checkbox before calling its click handler.
  item.checked = !item.checked;
  assert.deepStrictEqual(checkedLabels(context), ["Compact Dark", label]);
  return item.click();
}

function assertFailedSelection(context, originalContents, originalSelection, startup) {
  assert.strictEqual(fs.readFileSync(context.configFile, "utf8"), originalContents);
  assert.deepStrictEqual(context.configuration.themeSelection, originalSelection);
  assert.deepStrictEqual(context.configuration.startupConfig, startup);
  assert.deepStrictEqual(checkedLabels(context), ["Compact Dark"]);
  assert.strictEqual(context.window.setMenu.mock.callCount(), 2);
  assert.strictEqual(dialog.showMessageBox.mock.callCount(), 0);
  assert.deepStrictEqual(dialog.showErrorBox.mock.calls[0].arguments, [
    "Themes",
    "Could not save the theme selection. Check that config.json is valid and writable.",
  ]);
  assert.strictEqual(dialog.showErrorBox.mock.callCount(), 1);
  assert.deepStrictEqual(context.warning.mock.calls[0].arguments, [
    "[Themes] Could not save theme selection",
  ]);
}

describe("Menus theme save menu state", () => {
  for (const failedOperation of ["writeFileSync", "renameSync"]) {
    it(`restores the persisted checkmark after ${failedOperation} is denied`, async (t) => {
      const context = createContext(t);
      const originalContents = fs.readFileSync(context.configFile, "utf8");
      const originalSelection = context.configuration.themeSelection;
      const startup = structuredClone(context.configuration.startupConfig);
      const denied = Object.assign(new Error("Permission denied"), { code: "EACCES" });
      const operation = t.mock.method(fs, failedOperation, () => { throw denied; });

      await toggleTheme(context, "Custom", "Glass Dark");

      operation.mock.restore();
      assertFailedSelection(context, originalContents, originalSelection, startup);
      assert.deepStrictEqual(fs.readdirSync(context.directory).sort(), ["config.json", "themes"]);
    });
  }

  it("restores the previous checkmark if config.json is externally damaged", async (t) => {
    const context = createContext(t);
    const originalSelection = context.configuration.themeSelection;
    const startup = structuredClone(context.configuration.startupConfig);
    const damagedContents = "{invalid JSON";
    fs.writeFileSync(context.configFile, damagedContents);

    await toggleTheme(context, "Custom", "Glass Dark");

    assertFailedSelection(context, damagedContents, originalSelection, startup);
  });

  it("attaches a menu matching a successfully saved custom theme", async (t) => {
    const context = createContext(t);
    const original = JSON.parse(fs.readFileSync(context.configFile, "utf8"));
    const startup = structuredClone(context.configuration.startupConfig);

    await toggleTheme(context, "Custom", "Glass Dark");

    assert.deepStrictEqual(JSON.parse(fs.readFileSync(context.configFile, "utf8")), {
      ...original,
      appearance: { ...original.appearance, cssName: "custom:glass-dark" },
    });
    assert.deepStrictEqual(context.configuration.themeSelection, { cssName: "custom:glass-dark", cssLocation: "" });
    assert.deepStrictEqual(context.configuration.startupConfig, startup);
    assert.deepStrictEqual(checkedLabels(context), ["Glass Dark"]);
    assert.strictEqual(context.window.setMenu.mock.callCount(), 2);
    assert.strictEqual(dialog.showErrorBox.mock.callCount(), 0);
    assert.strictEqual(context.warning.mock.callCount(), 0);
  });
});
