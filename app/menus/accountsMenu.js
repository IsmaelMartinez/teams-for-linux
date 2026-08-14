const { MAX_ACCOUNTS } = require("../concurrentAccounts/registry");

// Builds the "Accounts" submenu for separate-process concurrent instances
// (ADR-027). Distinct from the ADR-020 "Profiles" switcher: clicking an
// account launches (or focuses) another Teams for Linux process rather
// than swapping a WebContentsView.

function buildAccountsMenu(menus) {
  const manager = menus.concurrentAccounts;
  if (!manager?.isEnabled()) return null;

  const list = manager.list();
  const atCap = list.length >= MAX_ACCOUNTS;
  const currentId = manager.getCurrent()?.id ?? null;

  const accountItems =
    list.length === 0
      ? [{ label: "(no extra accounts)", enabled: false }]
      : list.map((account) => ({
          label: account.label || account.name,
          type: "radio",
          checked: account.id === currentId,
          click: () => menus.openAccount(account.id),
        }));

  return {
    label: "Accounts",
    submenu: [
      {
        label: "Open another account…",
        enabled: !atCap,
        click: () => menus.addAccount(),
      },
      {
        label: "Manage accounts…",
        click: () => menus.manageAccounts(),
      },
      { type: "separator" },
      ...accountItems,
    ],
  };
}

module.exports = buildAccountsMenu;
