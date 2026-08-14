const { test, describe } = require("node:test");
const assert = require("node:assert");
const buildAccountsMenu = require("../../app/menus/accountsMenu");
const { MAX_ACCOUNTS, HOME_ID } = require("../../app/concurrentAccounts/registry");

function fakeMenus(accounts, { enabled = true, currentId = HOME_ID } = {}) {
  return {
    concurrentAccounts: {
      isEnabled: () => enabled,
      list: () => accounts,
      getCurrent: () => accounts.find((a) => a.id === currentId) || accounts[0],
      isAtCap: () => accounts.length >= MAX_ACCOUNTS,
    },
    addAccount: () => {},
    manageAccounts: () => {},
    openAccount: () => {},
  };
}

describe("buildAccountsMenu", () => {
  test("returns null when the manager is missing or disabled", () => {
    assert.strictEqual(buildAccountsMenu({ concurrentAccounts: null }), null);
    assert.strictEqual(
      buildAccountsMenu(fakeMenus([], { enabled: false })),
      null
    );
  });

  test("disables Open another account at the cap of 3", () => {
    const menu = buildAccountsMenu(
      fakeMenus([
        { id: HOME_ID, name: "This account" },
        { id: "a", name: "Work" },
        { id: "b", name: "Personal" },
      ])
    );
    const openItem = menu.submenu.find((i) => i.label === "Open another account…");
    assert.strictEqual(openItem.enabled, false);
    assert.strictEqual(menu.submenu.filter((i) => i.type === "radio").length, 3);
  });

  test("marks the current account as checked", () => {
    const menu = buildAccountsMenu(
      fakeMenus(
        [
          { id: HOME_ID, name: "This account", label: "This account" },
          { id: "a", name: "Work" },
        ],
        { currentId: "a" }
      )
    );
    const radios = menu.submenu.filter((i) => i.type === "radio");
    assert.strictEqual(radios[0].checked, false);
    assert.strictEqual(radios[1].checked, true);
  });

  test("uses the discovered identity label instead of This account", () => {
    const menu = buildAccountsMenu(
      fakeMenus([
        {
          id: HOME_ID,
          name: "This account",
          label: "alex@contoso.example",
        },
      ])
    );
    const radios = menu.submenu.filter((i) => i.type === "radio");
    assert.strictEqual(radios[0].label, "alex@contoso.example");
  });
});
