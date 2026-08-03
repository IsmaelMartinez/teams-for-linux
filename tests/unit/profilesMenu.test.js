const { test, describe } = require("node:test");
const assert = require("node:assert");
const buildProfilesMenu = require("../../app/menus/profilesMenu");

// ADR-020 Phase 1c.2: pinned profiles get CommandOrControl+Alt+<slot>
// accelerators in Profiles → Switch to, slotted 1-based by their order in the
// profile list. Unpinned profiles get no accelerator. The builder is pure
// (no Electron imports), so the mapping is unit-testable directly.

function fakeMenus(profiles, activeId = null) {
  return {
    profilesManager: {
      list: () => profiles,
      getActive: () => profiles.find((p) => p.id === activeId) || null,
    },
    addProfile: () => {},
    manageProfiles: () => {},
    switchProfile: () => {},
  };
}

function switchToItems(menu) {
  return menu.submenu.find((i) => i.label === "Switch to").submenu;
}

describe("buildProfilesMenu accelerators", () => {
  test("pinned profiles get 1-based Ctrl+Alt slots in list order", () => {
    const menu = buildProfilesMenu(
      fakeMenus([
        { id: "a", name: "A", pinned: true },
        { id: "b", name: "B", pinned: true },
        { id: "c", name: "C", pinned: true },
      ])
    );
    const items = switchToItems(menu);
    assert.strictEqual(items[0].accelerator, "CommandOrControl+Alt+1");
    assert.strictEqual(items[1].accelerator, "CommandOrControl+Alt+2");
    assert.strictEqual(items[2].accelerator, "CommandOrControl+Alt+3");
  });

  test("unpinned profiles get no accelerator", () => {
    const menu = buildProfilesMenu(
      fakeMenus([
        { id: "a", name: "A", pinned: false },
        { id: "b", name: "B" },
      ])
    );
    for (const item of switchToItems(menu)) {
      assert.strictEqual(item.accelerator, undefined);
    }
  });

  test("slots skip unpinned profiles (pinned order, not list index)", () => {
    const menu = buildProfilesMenu(
      fakeMenus([
        { id: "a", name: "A", pinned: false },
        { id: "b", name: "B", pinned: true },
        { id: "c", name: "C", pinned: false },
        { id: "d", name: "D", pinned: true },
      ])
    );
    const items = switchToItems(menu);
    assert.strictEqual(items[0].accelerator, undefined);
    assert.strictEqual(items[1].accelerator, "CommandOrControl+Alt+1");
    assert.strictEqual(items[2].accelerator, undefined);
    assert.strictEqual(items[3].accelerator, "CommandOrControl+Alt+2");
  });

  test("active profile keeps its radio checkmark alongside an accelerator", () => {
    const menu = buildProfilesMenu(
      fakeMenus([{ id: "a", name: "A", pinned: true }], "a")
    );
    const item = switchToItems(menu)[0];
    assert.strictEqual(item.checked, true);
    assert.strictEqual(item.type, "radio");
    assert.strictEqual(item.accelerator, "CommandOrControl+Alt+1");
  });

  test("empty list renders the disabled placeholder with no accelerator", () => {
    const menu = buildProfilesMenu(fakeMenus([]));
    const items = switchToItems(menu);
    assert.strictEqual(items.length, 1);
    assert.strictEqual(items[0].enabled, false);
    assert.strictEqual(items[0].accelerator, undefined);
  });
});
