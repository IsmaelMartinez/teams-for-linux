"use strict";

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert");

// #2885: config.json was unreachable from inside the app, and its directory
// differs per packaging format (deb, snap, flatpak, from source) — not
// somewhere anyone guesses. These pin the two Settings entries that open it.
//
// The menu builder is a pure function of a Menus-shaped object, so the
// structure and the wiring are testable without a real Electron runtime;
// appMenu only destructures `shell` at module scope, so the stub below is
// enough (same approach as cacheManager.test.js).

const electronPath = require.resolve("electron");
const appMenuPath = require.resolve("../../app/menus/appMenu");

let appMenu;

before(() => {
  require.cache[electronPath] = {
    id: electronPath,
    filename: electronPath,
    loaded: true,
    exports: { shell: { openExternal: () => {} } },
  };
  delete require.cache[appMenuPath];
  appMenu = require("../../app/menus/appMenu");
});

after(() => {
  delete require.cache[electronPath];
  delete require.cache[appMenuPath];
});

// Any method the menu calls is recorded rather than stubbed one by one, so
// this does not need updating when an unrelated entry is added.
function fakeMenus(calls) {
  return new Proxy(
    { configGroup: { startupConfig: {} } },
    {
      get(target, prop) {
        if (prop in target) return target[prop];
        return () => calls.push(prop);
      },
    },
  );
}

function settingsSubmenu(calls) {
  const menu = appMenu(fakeMenus(calls));
  const settings = menu.submenu.find((item) => item.label === "Settings");
  assert.ok(settings, "Settings menu went missing");
  return settings.submenu;
}

describe("Settings menu config entries", () => {
  it("offers both Open config file and Open config folder", () => {
    const labels = settingsSubmenu([])
      .filter((item) => item.label)
      .map((item) => item.label);

    assert.deepStrictEqual(labels, [
      "Save",
      "Restore",
      "Open config file",
      "Open config folder",
    ]);
  });

  it("wires Open config file to openConfigFile", () => {
    const calls = [];
    settingsSubmenu(calls)
      .find((i) => i.label === "Open config file")
      .click();

    assert.deepStrictEqual(calls, ["openConfigFile"]);
  });

  it("wires Open config folder to openConfigFolder", () => {
    const calls = [];
    settingsSubmenu(calls)
      .find((i) => i.label === "Open config folder")
      .click();

    assert.deepStrictEqual(calls, ["openConfigFolder"]);
  });

  it("separates the new entries from Save and Restore", () => {
    const submenu = settingsSubmenu([]);
    const separator = submenu.findIndex((i) => i.type === "separator");
    const openFile = submenu.findIndex((i) => i.label === "Open config file");

    assert.ok(separator > 0, "expected a separator before the config entries");
    assert.ok(separator < openFile);
  });
});
