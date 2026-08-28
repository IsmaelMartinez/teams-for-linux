/**
 * SenderProfileMap — ADR-020 Phase 2 foundation. Maps a `webContents` id to
 * the profile that owns it, so main-process IPC handlers can attribute a
 * message to the profile view that sent it (`event.sender`) instead of
 * assuming everything came from the single main window.
 *
 * Profile `WebContentsView`s are registered explicitly by
 * `ProfileViewManager` at view creation. The ROOT window is special: it hosts
 * Profile 0 (the legacy partition), but that profile record may not exist yet
 * at window creation — first-run bootstrap only registers it after a
 * successful login navigation. The owner therefore pushes the root profile id
 * in via `setRootProfileId` when the legacy profile appears (or goes away),
 * driven by the ProfilesManager events it already subscribes to. Lookups are
 * pure map reads — deliberately no ProfilesManager call on the resolve path,
 * because the settings store re-reads its JSON file on every access and
 * resolution sits on the per-badge-tick hot path once aggregation consumes it.
 *
 * KNOWN GAP (correct before relying on "null ⇒ not a profile"): child
 * surfaces spawned BY a profile view — `window.open()` popups and `<webview>`
 * guests inherit the view's partition and preload but are not registered
 * here, so they currently resolve to null. The consuming PR registers
 * descendants (`did-create-window` / `did-attach-webview`); until it lands,
 * null means "unattributed", never "safe to ignore".
 *
 * Pure module (no Electron imports) so the mapping logic is unit-testable
 * directly under `node --test`.
 */
class SenderProfileMap {
  /** @type {Map<number, string>} webContents.id → profile id */
  #byWebContentsId = new Map();
  /** @type {number|null} */
  #rootWebContentsId = null;
  /** @type {string|null} Profile 0's id once bootstrapped, else null. */
  #rootProfileId = null;
  #profilesManager;

  /**
   * @param {ProfilesManager} profilesManager  Used only by `getProfileFor`
   *   to return the full profile record; resolution itself never touches it.
   */
  constructor(profilesManager) {
    this.#profilesManager = profilesManager;
  }

  /** The root window's webContents hosts the legacy-partition profile. */
  setRootWebContentsId(webContentsId) {
    this.#rootWebContentsId = webContentsId;
  }

  /**
   * The legacy-partition profile's id, or null while Profile 0 does not
   * exist (pre-bootstrap, or after its removal). Owned by ProfileViewManager,
   * updated from the ProfilesManager add/remove events.
   */
  setRootProfileId(profileId) {
    this.#rootProfileId = profileId ?? null;
  }

  register(webContentsId, profileId) {
    this.#byWebContentsId.set(webContentsId, profileId);
  }

  unregister(webContentsId) {
    this.#byWebContentsId.delete(webContentsId);
  }

  clear() {
    this.#byWebContentsId.clear();
    this.#rootWebContentsId = null;
    this.#rootProfileId = null;
  }

  /**
   * Pure map lookup — no I/O.
   * @param {number} webContentsId
   * @returns {string|null} The owning profile's id, or null when the sender
   *   is unattributed: the switcher pill, a dialog window, the root window
   *   before Profile 0 is bootstrapped — or (see KNOWN GAP above) a child
   *   window / webview guest spawned by a profile view.
   */
  resolveProfileId(webContentsId) {
    const direct = this.#byWebContentsId.get(webContentsId);
    if (direct !== undefined) return direct;
    if (
      this.#rootWebContentsId !== null &&
      webContentsId === this.#rootWebContentsId
    ) {
      return this.#rootProfileId;
    }
    return null;
  }

  /**
   * Convenience for IPC handlers: resolve an `IpcMainEvent` /
   * `IpcMainInvokeEvent` straight to the sender's full profile record. Reads
   * the profile list once — hot-path consumers that only need the id should
   * use `resolveProfileId`.
   * @returns {object|null}
   */
  getProfileFor(event) {
    const senderId = event?.sender?.id;
    if (typeof senderId !== "number") return null;
    const profileId = this.resolveProfileId(senderId);
    if (profileId === null) return null;
    return (
      this.#profilesManager.list().find((p) => p.id === profileId) ?? null
    );
  }
}

module.exports = SenderProfileMap;
