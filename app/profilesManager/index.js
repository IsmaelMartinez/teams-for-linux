const { ipcMain } = require("electron");
const crypto = require("node:crypto");

const STORE_KEY = "app.profiles";
const PARTITION_PREFIX = "persist:teams-profile-";

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
    // `id` and `partition` are immutable for the lifetime of the profile.
    const { id: _id, partition: _partition, ...safePatch } = patch || {};
    state.list[idx] = { ...state.list[idx], ...safePatch };
    this.#write(state);
    return state.list[idx];
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
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

module.exports = ProfilesManager;
