const pill = document.getElementById("pill");
const pillAvatar = document.getElementById("pill-avatar");
const pillUnread = document.getElementById("pill-unread");
const scrim = document.getElementById("scrim");
const dropdown = document.getElementById("dropdown");
const listEl = document.getElementById("profile-list");
const addLink = document.getElementById("add-link");
const manageLink = document.getElementById("manage-link");

const api = globalThis.profileSwitcherApi;

let profiles = [];
let activeId = null;
let open = false; // dropdown open
// Whether the pinned-profile menu accelerators can fire on this platform;
// pushed by main in profile-switcher-state. Default false so we never
// advertise a chord before main confirms it works.
let shortcutsAvailable = false;
/** @type {Record<string, number>} profile id → unread count, pushed by main */
let unreadByProfileId = {};

function activeProfile() {
  return profiles.find((p) => p.id === activeId) || null;
}

const DEFAULT_AVATAR_COLOR = "#6264a7";

function paintAvatar(el, profile) {
  el.textContent = profile ? profile.avatarInitials || "?" : "?";
  // avatarColor is renderer-controlled and only length-capped upstream; apply
  // it via the style API only if it's a valid CSS color, so a malformed or
  // hostile value can't inject arbitrary declarations into the style attribute.
  const color = profile?.avatarColor;
  el.style.background =
    color && CSS.supports("background-color", color)
      ? color
      : DEFAULT_AVATAR_COLOR;
}

function unreadFor(profileId) {
  const count = unreadByProfileId[profileId];
  return Number.isFinite(count) && count > 0 ? count : 0;
}

function renderPill() {
  const active = activeProfile();
  paintAvatar(pillAvatar, active);
  // Only OTHER profiles light the dot: the active one's unread is already
  // on screen in Teams itself.
  const elsewhere = profiles.some(
    (p) => p.id !== activeId && unreadFor(p.id) > 0
  );
  pillUnread.hidden = !elsewhere;
  const label = active ? `${active.name} — switch profile` : "Switch profile";
  pill.title = elsewhere ? `${label} (unread in other profiles)` : label;
}

function renderList() {
  // Pushes rebuild the list while the dropdown is open; put keyboard focus
  // back on the same profile's row or Enter stops working mid-navigation.
  const focusedId = listEl.contains(document.activeElement)
    ? document.activeElement.dataset.profileId
    : null;
  listEl.textContent = "";
  let nextSlot = 0;
  for (const profile of profiles) {
    const li = document.createElement("li");
    const row = document.createElement("button");
    row.type = "button";
    row.className =
      "profile-row" + (profile.id === activeId ? " active" : "");
    row.dataset.profileId = profile.id;

    const avatar = document.createElement("span");
    avatar.className = "avatar";
    paintAvatar(avatar, profile);

    const name = document.createElement("span");
    name.className = "name";
    name.textContent = profile.name;

    row.append(avatar, name);
    const unread = unreadFor(profile.id);
    if (unread > 0) {
      const badge = document.createElement("span");
      badge.className = "unread-badge";
      badge.textContent = unread > 99 ? "99+" : String(unread);
      badge.setAttribute("aria-label", `${unread} unread`);
      row.append(badge);
    }
    // Matches the accelerator scheme in app/menus/profilesMenu.js: pinned
    // profiles get Ctrl+Alt+<slot>, slotted by list order. Only advertised
    // when the chord can actually fire (per-window menus don't exist on
    // macOS — main tells us via shortcutsAvailable).
    if (profile.pinned) {
      const slot = ++nextSlot;
      if (shortcutsAvailable) {
        const hint = document.createElement("span");
        hint.className = "shortcut-hint";
        hint.textContent = `Ctrl+Alt+${slot}`;
        row.append(hint);
      }
    }
    row.addEventListener("click", () => selectProfile(profile.id));
    li.append(row);
    listEl.append(li);
  }
  if (focusedId) {
    listEl
      .querySelector(`[data-profile-id="${CSS.escape(focusedId)}"]`)
      ?.focus();
  }
}

async function setOpen(next) {
  if (open === next) return;
  open = next;
  pill.setAttribute("aria-expanded", String(open));
  if (!open) {
    scrim.hidden = true;
    dropdown.hidden = true;
    api.setExpanded(false);
    return;
  }
  // Grow the view to full-window BEFORE revealing the dropdown so it isn't
  // clipped by the resting corner-pill bounds. If a close raced in while we
  // awaited the grow, `open` is already false again — bail.
  renderList();
  await api.setExpanded(true);
  if (!open) return;
  scrim.hidden = false;
  dropdown.hidden = false;
}

function selectProfile(id) {
  setOpen(false);
  if (id === activeId) return;
  // The switch triggers a main→renderer state push, which re-renders the
  // pill; optimistically update so the UI feels instant.
  activeId = id;
  renderPill();
  api.switch(id).catch(() => {
    // Switch failed (e.g. profile vanished mid-click); pull fresh state.
    refresh();
  });
}

async function refresh() {
  try {
    const [list, active] = await Promise.all([api.list(), api.getActive()]);
    profiles = Array.isArray(list) ? list : [];
    activeId = active ? active.id : null;
    renderPill();
    if (open) renderList();
  } catch {
    // Leave the last good render in place.
  }
}

pill.addEventListener("click", () => setOpen(!open));
scrim.addEventListener("click", () => setOpen(false));

addLink.addEventListener("click", () => {
  setOpen(false);
  api.openAddDialog();
});
manageLink.addEventListener("click", () => {
  setOpen(false);
  api.openManageDialog();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") setOpen(false);
});

// Collapse the dropdown when the pill loses focus (user clicked into Teams).
globalThis.addEventListener("blur", () => setOpen(false));

// Main pushes fresh state on any profile add/update/switch/remove.
api.onState((state) => {
  profiles = Array.isArray(state?.profiles) ? state.profiles : [];
  activeId = state?.activeId ?? null;
  if (typeof state?.shortcutsAvailable === "boolean") {
    shortcutsAvailable = state.shortcutsAvailable;
  }
  renderPill();
  if (open) renderList();
});

api.onUnread((payload) => {
  const next = payload?.unreadByProfileId;
  unreadByProfileId = next && typeof next === "object" ? next : {};
  renderPill();
  if (open) renderList();
});

// Pull initial state on load (robust against push/load ordering).
refresh();
