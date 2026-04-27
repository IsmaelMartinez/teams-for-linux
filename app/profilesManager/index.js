const { ipcMain } = require("electron");
const crypto = require("node:crypto");

const STORE_KEY = "app.profiles";
const PARTITION_PREFIX = "persist:teams-profile-";

// Free-text caps so a renderer-supplied string cannot land oversized in CSS
// (avatarColor) or DOM text (avatarInitials, url) once Phase 1c wires the
// switcher UI. Picked to be roomy for legitimate values:
//   - avatarColor: hex (#RRGGBBAA = 9), HSL ("hsl(360, 100%, 100%)" = 19)
//   - avatarInitials: 2 graphemes — kept at 4 to allow a few combining marks
//   - url: aligned with common HTTP URL caps
const MAX_AVATAR_COLOR_LEN = 64;
const MAX_AVATAR_INITIALS_LEN = 4;
const MAX_URL_LEN = 2048;

function ensureLength(value, max, field) {
  if (typeof value === "string" && value.length > max) {
    throw new Error(
      `[ProfilesManager] ${field} exceeds ${max} characters`
    );
  }
}

/**
 * ProfilesManager — Phase 1b foundation for the multi-account switcher
 * (ADR-020). Owns CRUD against `settingsStore` under `app.profiles`. UI
 * wiring (WebContentsView creation, switcher dropdown, menu entries,
 * keyboard shortcuts, first-run bootstrap of Profile 0) lands in later
 * phases — this module exposes the data surface those phases will call.
 *
 * Storage shape under `app.profiles`:
 *   {
 *     list: [
 *       { id, name, partition, avatarColor, avatarInitials,
 *         disableNotifications, muted, pinned, url }
 *     ],
 *     activeId: string | null
 *   }
 */
class ProfilesManager {
  #settingsStore;
  #initialized = false;

  constructor(settingsStore) {
    this.#settingsStore = settingsStore;
  }

  initialize() {
    if (this.#initialized) return;
    this.#initialized = true;

    // ADR-020: list every profile this user has configured
    ipcMain.handle("profile-list", async () => this.list());
    // ADR-020: return the currently active profile, or null
    ipcMain.handle("profile-get-active", async () => this.getActive());
    // ADR-020: mark a profile active; UI swaps the visible WebContentsView
    ipcMain.handle("profile-switch", async (_event, id) => this.switch(id));
    // ADR-020: persist a new profile; UI creates the matching view
    ipcMain.handle("profile-add", async (_event, record) => this.add(record));
    // ADR-020: patch a profile's metadata (name, avatar, pinned, etc.)
    ipcMain.handle("profile-update", async (_event, id, patch) =>
      this.update(id, patch)
    );
    // ADR-020: delete a profile; UI is responsible for clearing storage
    ipcMain.handle("profile-remove", async (_event, id) => this.remove(id));
  }

  list() {
    return this.#read().list;
  }

  getActive() {
    const { list, activeId } = this.#read();
    if (!activeId) return null;
    return list.find((p) => p.id === activeId) || null;
  }

  switch(id) {
    const state = this.#read();
    const profile = state.list.find((p) => p.id === id);
    if (!profile) {
      throw new Error(`[ProfilesManager] No profile with id ${id}`);
    }
    state.activeId = id;
    this.#write(state);
    return profile;
  }

  add(record) {
    const name = typeof record?.name === "string" ? record.name.trim() : "";
    if (!name) {
      throw new Error("[ProfilesManager] Profile name is required");
    }
    ensureLength(record.avatarColor, MAX_AVATAR_COLOR_LEN, "avatarColor");
    ensureLength(record.avatarInitials, MAX_AVATAR_INITIALS_LEN, "avatarInitials");
    ensureLength(record.url, MAX_URL_LEN, "url");

    const id = crypto.randomUUID();
    const profile = {
      id,
      name,
      partition: `${PARTITION_PREFIX}${id}`,
      avatarColor:
        typeof record.avatarColor === "string"
          ? record.avatarColor
          : deriveAvatarColor(id),
      avatarInitials:
        typeof record.avatarInitials === "string" && record.avatarInitials
          ? record.avatarInitials
          : deriveInitials(name),
      disableNotifications: !!record.disableNotifications,
      muted: !!record.muted,
      pinned: !!record.pinned,
      ...(typeof record.url === "string" && record.url ? { url: record.url } : {}),
    };

    const state = this.#read();
    state.list.push(profile);
    if (!state.activeId) state.activeId = id;
    this.#write(state);
    return profile;
  }

  update(id, patch) {
    const state = this.#read();
    const idx = state.list.findIndex((p) => p.id === id);
    if (idx === -1) {
      throw new Error(`[ProfilesManager] No profile with id ${id}`);
    }
    // Allowlist the mutable fields and validate them per type. `id` and
    // `partition` stay immutable; arbitrary extra keys from the renderer
    // never reach the settings file.
    const next = { ...state.list[idx] };
    const p = patch || {};
    if (Object.hasOwn(p, "name")) {
      const name = typeof p.name === "string" ? p.name.trim() : "";
      if (!name) {
        throw new Error("[ProfilesManager] Profile name cannot be empty");
      }
      next.name = name;
    }
    if (typeof p.avatarColor === "string") {
      ensureLength(p.avatarColor, MAX_AVATAR_COLOR_LEN, "avatarColor");
      next.avatarColor = p.avatarColor;
    }
    if (typeof p.avatarInitials === "string" && p.avatarInitials) {
      ensureLength(p.avatarInitials, MAX_AVATAR_INITIALS_LEN, "avatarInitials");
      next.avatarInitials = p.avatarInitials;
    }
    if (Object.hasOwn(p, "disableNotifications")) {
      next.disableNotifications = !!p.disableNotifications;
    }
    if (Object.hasOwn(p, "muted")) next.muted = !!p.muted;
    if (Object.hasOwn(p, "pinned")) next.pinned = !!p.pinned;
    if (Object.hasOwn(p, "url")) {
      if (typeof p.url === "string" && p.url) {
        ensureLength(p.url, MAX_URL_LEN, "url");
        next.url = p.url;
      } else if (p.url === null || p.url === "") {
        delete next.url;
      }
    }
    state.list[idx] = next;
    this.#write(state);
    return next;
  }

  remove(id) {
    const state = this.#read();
    const idx = state.list.findIndex((p) => p.id === id);
    if (idx === -1) {
      throw new Error(`[ProfilesManager] No profile with id ${id}`);
    }
    state.list.splice(idx, 1);
    if (state.activeId === id) {
      state.activeId = state.list[0]?.id || null;
    }
    this.#write(state);
    return { removedId: id, activeId: state.activeId };
  }

  #read() {
    const raw = this.#settingsStore.get(STORE_KEY) || {};
    return {
      list: Array.isArray(raw.list) ? raw.list : [],
      activeId: typeof raw.activeId === "string" ? raw.activeId : null,
    };
  }

  #write(state) {
    this.#settingsStore.set(STORE_KEY, state);
  }
}

function deriveAvatarColor(seed) {
  // Stable HSL pulled from the seed; matches ADR-020's "deterministically
  // derived from a hash of the partition string" requirement for Profile 0
  // and gives every other profile a non-random default.
  const hash = crypto.createHash("sha256").update(seed).digest();
  const hue = hash[0] * 360 / 256;
  return `hsl(${Math.round(hue)}, 65%, 45%)`;
}

function deriveInitials(name) {
  // Step into the string by Unicode code points, not UTF-16 code units, so a
  // surrogate-pair leading character (emoji, supplementary-plane scripts)
  // doesn't land us on half a character. `toLocaleUpperCase` keeps Turkish/
  // Greek casing rules sensible.
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const firstCodePoint = (s) => Array.from(s)[0] || "";
  if (parts.length === 1) {
    return Array.from(parts[0]).slice(0, 2).join("").toLocaleUpperCase();
  }
  return (
    firstCodePoint(parts[0]) + firstCodePoint(parts[parts.length - 1])
  ).toLocaleUpperCase();
}

module.exports = ProfilesManager;
