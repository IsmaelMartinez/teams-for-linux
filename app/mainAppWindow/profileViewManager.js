const { WebContentsView, session } = require("electron");
const path = require("node:path");

const LEGACY_PARTITION = "persist:teams-4-linux";

/**
 * ProfileViewManager — Phase 1c.1 of the multi-account profile switcher
 * (ADR-020). Owns the per-profile `WebContentsView` overlays that sit on
 * top of the main `BrowserWindow`'s content area.
 *
 * Architecture: Profile 0 (the legacy `persist:teams-4-linux` partition)
 * lives on the root window's `webContents` — it is the existing main
 * window we have today. Switching to Profile 0 hides every overlay so
 * the underlying root window is visible. Adding a new profile creates a
 * `WebContentsView` against `persist:teams-profile-{uuid}`; switching to
 * that profile shows the matching overlay over the root window.
 *
 * No view is created for legacy-partition profiles; the root window
 * already serves that role. This avoids running Teams twice in the same
 * partition and keeps the scope of 1c.1 surgical (no rerouting of the
 * existing auth-recovery or `msteams://` deep-link handlers, both of
 * which operate on `window.webContents`).
 *
 * Subscribes to `profilesManager` lifecycle events so that profile
 * mutations from any source (main-side bootstrap, IPC from a future
 * switcher UI, or a unit-style direct call) keep the view set in sync.
 */
class ProfileViewManager {
  #window;
  #profilesManager;
  #config;
  #views = new Map();
  #handlers = null;
  #resizeHandler = null;
  #initialized = false;

  /**
   * @param {Electron.BrowserWindow} window  Main app window
   * @param {ProfilesManager} profilesManager
   * @param {object} config  Loaded app config (need `chromeUserAgent`,
   *                         `url`, and config gate `multiAccount.enabled`)
   */
  constructor(window, profilesManager, config) {
    this.#window = window;
    this.#profilesManager = profilesManager;
    this.#config = config;
  }

  initialize() {
    if (this.#initialized) return;
    this.#initialized = true;

    this.#handlers = {
      add: (profile) => this.#onAdd(profile),
      switch: (profile) => this.#onSwitch(profile),
      remove: (result) => this.#onRemove(result),
    };
    this.#profilesManager.on("add", this.#handlers.add);
    this.#profilesManager.on("switch", this.#handlers.switch);
    this.#profilesManager.on("remove", this.#handlers.remove);

    this.#resizeHandler = () => this.#applyBoundsToAll();
    this.#window.on("resize", this.#resizeHandler);

    // Tear down on window close so the WebContentsView instances and the
    // ProfilesManager listeners do not outlive the window. `once` because
    // the window is destroyed after the event fires.
    this.#window.once("closed", () => this.dispose());

    // Materialize views for any pre-existing non-legacy profiles. Hide
    // them all initially; the active profile is shown below if applicable.
    for (const profile of this.#profilesManager.list()) {
      if (profile.partition !== LEGACY_PARTITION) {
        this.#createView(profile);
      }
    }

    const active = this.#profilesManager.getActive();
    if (active) this.#showActive(active);
  }

  /**
   * Bootstrap Profile 0 from the legacy `persist:teams-4-linux` partition
   * if (a) no profiles exist yet and (b) the legacy partition has cookies.
   * The cookies-only heuristic catches every realistic warm-Teams session
   * while keeping the check to a single async call (ADR-020 § "First-run
   * bootstrap"; design decision logged in plans/feature-phase1c-multi-account.md).
   *
   * Idempotent under serial calls — returns early when profiles already
   * exist. Two concurrent calls would race past the `list().length > 0`
   * guard and the second `bootstrapLegacyProfile()` would throw; only one
   * caller exists today (`onAppReady` in `app/index.js`).
   */
  async bootstrapProfileZeroIfNeeded() {
    if (this.#profilesManager.list().length > 0) return null;

    let cookies;
    try {
      cookies = await session.fromPartition(LEGACY_PARTITION).cookies.get({});
    } catch (error) {
      console.warn(
        "[ProfileViewManager] Failed to read legacy cookies; skipping bootstrap",
        { message: error.message }
      );
      return null;
    }

    if (!Array.isArray(cookies) || cookies.length === 0) {
      console.debug(
        "[ProfileViewManager] Legacy partition has no cookies; bootstrap skipped"
      );
      return null;
    }

    const profile = this.#profilesManager.bootstrapLegacyProfile();
    console.info("[ProfileViewManager] Bootstrapped Profile 0", {
      id: profile.id,
    });
    return profile;
  }

  dispose() {
    if (!this.#initialized) return;
    if (this.#handlers) {
      this.#profilesManager.off("add", this.#handlers.add);
      this.#profilesManager.off("switch", this.#handlers.switch);
      this.#profilesManager.off("remove", this.#handlers.remove);
      this.#handlers = null;
    }
    if (this.#resizeHandler) {
      this.#window.removeListener("resize", this.#resizeHandler);
      this.#resizeHandler = null;
    }
    for (const profileId of this.#views.keys()) {
      this.#destroyView(profileId);
    }
    this.#initialized = false;
  }

  // --- Event handlers --------------------------------------------------

  #onAdd(profile) {
    if (profile.partition === LEGACY_PARTITION) {
      // Profile 0 lives on the root window; no overlay needed.
      return;
    }
    this.#createView(profile);
  }

  #onSwitch(profile) {
    this.#showActive(profile);
  }

  #onRemove({ removedId, activeId }) {
    this.#destroyView(removedId);
    if (activeId) {
      const next = this.#profilesManager
        .list()
        .find((p) => p.id === activeId);
      if (next) this.#showActive(next);
    } else {
      this.#hideAllOverlays();
    }
  }

  // --- View lifecycle --------------------------------------------------

  #createView(profile) {
    const view = new WebContentsView({
      webPreferences: {
        partition: profile.partition,
        preload: path.join(__dirname, "..", "browser", "preload.js"),
        plugins: true,
        spellcheck: true,
        webviewTag: true,
        // SECURITY: matches the root window's webPreferences
        // (browserWindowManager.js). Required for Teams DOM access via
        // ReactHandler; compensated by IPC validation.
        contextIsolation: false,
        nodeIntegration: false,
        sandbox: false,
      },
    });

    this.#views.set(profile.id, view);
    this.#applyBounds(view);

    const url = profile.url || this.#config.url;
    view.webContents.loadURL(url, {
      userAgent: this.#config.chromeUserAgent,
    });
  }

  #destroyView(profileId) {
    const view = this.#views.get(profileId);
    if (!view) return;
    this.#views.delete(profileId);

    try {
      this.#window.contentView.removeChildView(view);
    } catch {
      // View may not be currently attached; ignore.
    }

    // Clear the partition's storage so a re-added profile with the same
    // name does not see the previous tenant's data. ADR-020 § "Remove a
    // profile" requires this destructive clear; UI confirmation is the
    // caller's responsibility (Phase 1c.2 dialog).
    const partitionSession = view.webContents.session;
    partitionSession
      .clearStorageData()
      .catch((error) =>
        console.warn(
          "[ProfileViewManager] clearStorageData failed",
          { profileId, message: error.message }
        )
      );

    if (!view.webContents.isDestroyed()) {
      view.webContents.close();
    }
  }

  #showActive(profile) {
    if (profile.partition === LEGACY_PARTITION) {
      // Profile 0 is the root window; just hide all overlays.
      this.#hideAllOverlays();
      return;
    }
    this.#hideAllOverlays();
    const view = this.#views.get(profile.id);
    if (!view) {
      console.warn(
        "[ProfileViewManager] No view for active profile; nothing to show",
        { profileId: profile.id }
      );
      return;
    }
    this.#applyBounds(view);
    this.#window.contentView.addChildView(view);
  }

  #hideAllOverlays() {
    for (const view of this.#views.values()) {
      try {
        this.#window.contentView.removeChildView(view);
      } catch {
        // Already detached; ignore.
      }
    }
  }

  // --- Bounds ----------------------------------------------------------

  #applyBoundsToAll() {
    for (const view of this.#views.values()) this.#applyBounds(view);
  }

  #applyBounds(view) {
    const [width, height] = this.#window.getContentSize();
    view.setBounds({ x: 0, y: 0, width, height });
  }
}

module.exports = ProfileViewManager;
