const { test, describe } = require("node:test");
const assert = require("node:assert");
const appMenu = require("../../app/menus/appMenu");

// #2885: config.json's location differs per install format (deb/rpm/tar.gz/
// AppImage vs snap vs flatpak vs from-source) and is not something a user can
// reasonably guess, so the Settings menu gets a direct way to reach it.

function fakeMenus(overrides = {}) {
  return {
    configGroup: { startupConfig: {} },
    saveSettings: () => {},
    restoreSettings: () => {},
    openConfigFile: () => {},
    openConfigFolder: () => {},
    ...overrides,
  };
}

function settingsSubmenu(menus) {
  const menu = appMenu(menus);
  return menu.submenu.find((i) => i.label === "Settings").submenu;
}

describe("appMenu Settings submenu", () => {
  test("adds Open config file and Open config folder after a separator", () => {
    const submenu = settingsSubmenu(fakeMenus());
    const labels = submenu.map((i) => i.label || i.type);
    assert.deepStrictEqual(labels, [
      "Save",
      "Restore",
      "separator",
      "Open config file",
      "Open config folder",
    ]);
  });

  test("Open config file calls Menus.openConfigFile", () => {
    let called = false;
    const submenu = settingsSubmenu(
      fakeMenus({ openConfigFile: () => (called = true) })
    );
    submenu.find((i) => i.label === "Open config file").click();
    assert.strictEqual(called, true);
  });

  test("Open config folder calls Menus.openConfigFolder", () => {
    let called = false;
    const submenu = settingsSubmenu(
      fakeMenus({ openConfigFolder: () => (called = true) })
    );
    submenu.find((i) => i.label === "Open config folder").click();
    assert.strictEqual(called, true);
  });
});
