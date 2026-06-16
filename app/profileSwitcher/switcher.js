const pill = document.getElementById("pill");
const pillAvatar = document.getElementById("pill-avatar");
const pillName = document.getElementById("pill-name");
const scrim = document.getElementById("scrim");
const dropdown = document.getElementById("dropdown");
const listEl = document.getElementById("profile-list");
const addLink = document.getElementById("add-link");
const manageLink = document.getElementById("manage-link");

const api = globalThis.profileSwitcherApi;

let profiles = [];
let activeId = null;
let open = false;

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

function renderPill() {
  const active = activeProfile();
  paintAvatar(pillAvatar, active);
  pillName.textContent = active ? active.name : "No profile";
}

function renderList() {
  listEl.textContent = "";
  for (const profile of profiles) {
    const li = document.createElement("li");
    const row = document.createElement("button");
    row.type = "button";
    row.className =
      "profile-row" + (profile.id === activeId ? " active" : "");

    const avatar = document.createElement("span");
    avatar.className = "avatar";
    paintAvatar(avatar, profile);

    const name = document.createElement("span");
    name.className = "name";
    name.textContent = profile.name;

    row.append(avatar, name);
    row.addEventListener("click", () => selectProfile(profile.id));
    li.append(row);
    listEl.append(li);
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
  // Grow the strip BEFORE revealing the dropdown so it isn't clipped by the
  // collapsed 40px height. If a close raced in while we awaited the grow,
  // `open` is already false again — bail rather than revealing a stale panel.
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

// Clicking the strip bar itself (anywhere but the pill) while the dropdown is
// open collapses it — the bar is part of the same opaque hit-test rectangle,
// so without this a click there would otherwise be swallowed with no effect.
document.querySelector(".strip").addEventListener("click", (e) => {
  if (open && !pill.contains(e.target)) setOpen(false);
});

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

// Collapse when the strip loses focus (user clicked into Teams content).
globalThis.addEventListener("blur", () => setOpen(false));

// Main pushes fresh state on any profile add/update/switch/remove.
api.onState((state) => {
  profiles = Array.isArray(state?.profiles) ? state.profiles : [];
  activeId = state?.activeId ?? null;
  renderPill();
  if (open) renderList();
});

// Pull initial state on load (robust against push/load ordering).
refresh();
