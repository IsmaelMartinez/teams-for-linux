// Phase 1c.2 of ADR-020. Builds the "Profiles" submenu shown when
// `multiAccount.enabled === true`. Add-profile and Manage-profiles open
// their respective dialog modules; Manage handles inline rename and
// destructive remove with native confirmation.
//
// Active profile gets a radio checkmark in the Switch-to list. When the
// list is empty (flag freshly flipped on, before bootstrap or any add),
// the submenu shows a disabled placeholder so Electron's platform-
// specific empty-submenu rendering doesn't surface as a UX glitch.
// Manage is also disabled in that empty state — there is nothing to
// manage yet.

function buildProfilesMenu(menus) {
  const pm = menus.profilesManager;
  if (!pm) return null;

  const list = pm.list();
  const activeId = pm.getActive()?.id ?? null;

  return {
    label: "Profiles",
    submenu: [
      {
        label: "Add profile…",
        click: () => menus.addProfile(),
      },
      {
        label: "Manage profiles…",
        enabled: list.length > 0,
        click: () => menus.manageProfiles(),
      },
      { type: "separator" },
      {
        label: "Switch to",
        submenu:
          list.length === 0
            ? [{ label: "(no profiles configured)", enabled: false }]
            : list.map((p) => ({
                label: p.name,
                type: "radio",
                checked: p.id === activeId,
                click: () => menus.switchProfile(p.id),
              })),
      },
    ],
  };
}

module.exports = buildProfilesMenu;
