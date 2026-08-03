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

  // Pinned profiles get Ctrl+Alt+1…5 accelerators, slotted by their order
  // in the profile list (ADR-020 Phase 1). Ctrl+Alt rather than Ctrl+Shift:
  // the Teams web client binds Ctrl+Shift+<digit> for its own app-bar
  // navigation, so that namespace would steal Teams chords for pinned slots
  // and fall through inconsistently for unpinned ones (also flagged by a
  // community tester on #2495). Menu accelerators only fire while the app is
  // focused — exactly the scope we want for a switch chord — and the menu
  // already rebuilds on every ProfilesManager event, so pin changes re-slot
  // automatically. `pinnedSlots` maps profile id → 1-based slot.
  const pinnedSlots = new Map(
    list.filter((p) => p.pinned).map((p, i) => [p.id, i + 1])
  );

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
            : list.map((p) => {
                const slot = pinnedSlots.get(p.id);
                return {
                  label: p.name,
                  type: "radio",
                  checked: p.id === activeId,
                  ...(slot
                    ? { accelerator: `CommandOrControl+Alt+${slot}` }
                    : {}),
                  click: () => menus.switchProfile(p.id),
                };
              }),
      },
    ],
  };
}

module.exports = buildProfilesMenu;
