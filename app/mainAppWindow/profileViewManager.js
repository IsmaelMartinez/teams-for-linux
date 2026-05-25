const { WebContentsView, session } = require("electron");
const path = require("node:path");

const LEGACY_PARTITION = "persist:teams-4-linux";

// Hostnames the bootstrap-on-navigate listener treats as "Teams was
// successfully reached" — i.e. the post-login destinations. We
// deliberately exclude `login.microsoftonline.com` and other pre-auth
// URLs so navigating to the login page (which sets its own cookies on
// the partition) does not falsely trigger bootstrap.
const TEAMS_HOST_RE =
  /(^|\.)teams\.(microsoft\.com|live\.com|cloud\.microsoft)$/;

function isTeamsNavigationUrl(url) {
  if (!url || typeof url !== "string") return false;
  try {
    const { protocol, hostname } = new URL(url);
    return protocol === "https:" && TEAMS_HOST_RE.test(hostname);
  } catch {
    return false;
  }
}

// Cookie names that only appear on the partition after the user has
// successfully completed the Microsoft auth flow (vs. pre-auth tracking
// cookies like `MUID`/`MSCC` that get set on first visit to a Teams
// hostname). Mirrors the smaller "is the user signed in" subset of the
// `AUTH_COOKIE_NAMES` set in `app/mainAppWindow/index.js`. Kept inline
// (rather than imported) to avoid circular requires; if a third caller
// ever needs the same check we'll extract a shared constants module.
const AUTH_COOKIE_NAMES = new Set([
  "ESTSAUTH",
  "ESTSAUTHPERSISTENT",
  "ESTSAUTHLIGHT",
  "SignInStateCookie",
  "FedAuth",
  "rtFa",
]);

function hasAuthCookie(cookies) {
  return (
    Array.isArray(cookies) && cookies.some((c) => AUTH_COOKIE_NAMES.has(c.name))
  );
}

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
  #bindDisplayMediaHandler;
  #views = new Map();
  #handlers = null;
  #resizeHandler = null;
  #navigationHandler = null;
  #bootstrapInFlight = false;
  #initialized = false;

  /**
   * @param {Electron.BrowserWindow} window  Main app window
   * @param {ProfilesManager} profilesManager
   * @param {object} config  Loaded app config (need `chromeUserAgent`,
   *                         `url`, and config gate `multiAccount.enabled`)
   * @param {(session: Electron.Session) => void} bindDisplayMediaHandler
   *   Binds the in-app screen-share picker to a session. Called for each
   *   profile view's partition session so multi-account screen-share
   *   matches Profile 0's behaviour (#2529).
   */
  constructor(window, profilesManager, config, bindDisplayMediaHandler) {
    this.#window = window;
    this.#profilesManager = profilesManager;
    this.#config = config;
    this.#bindDisplayMediaHandler = bindDisplayMediaHandler;
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

    // Bootstrap-on-navigate: a fresh-install user launches with the
    // legacy partition empty, so the startup bootstrap sees no cookies
    // and skips. Once they complete the in-window login, the partition
    // gains cookies but Profile 0 has not been registered, so the
    // Profiles → Switch to submenu sits empty. Re-running the bootstrap
    // on every navigation that lands on a Teams URL closes that gap:
    // the moment the user reaches Teams post-login, Profile 0 gets
    // registered, the menu rebuilds via ProfilesManager's `add` event,
    // and the user sees their account in Switch-to without restarting.
    //
    // Filtering by destination URL matters — `login.microsoftonline.com`
    // and other pre-auth pages set their own cookies on the partition,
    // which would falsely trip the cookies-only bootstrap heuristic. We
    // only act on landings on a Teams hostname, which is where a real
    // post-login session ends up.
    //
    // Cost is one URL parse per top-level navigation, plus one cookie
    // read per Teams-URL landing. Once Profile 0 exists,
    // `bootstrapProfileZeroIfNeeded` short-circuits on its guard and
    // the cookie read is skipped.
    this.#navigationHandler = (_event, url) => {
      if (!isTeamsNavigationUrl(url)) return;
      this.bootstrapProfileZeroIfNeeded().catch((error) => {
        console.warn(
          "[ProfileViewManager] Bootstrap-on-navigate failed",
          { message: error.message }
        );
      });
    };
    this.#window.webContents.on("did-navigate", this.#navigationHandler);

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
   * Idempotent and re-entrancy-safe. Two guards protect concurrent
   * callers — `did-navigate` can fire several times in rapid succession
   * during a login redirect chain, and the `await` on `cookies.get()`
   * yields the event loop between the `hasLegacyProfile` check and the
   * `bootstrapLegacyProfile()` call, so a sync-only guard is not enough:
   *
   *   1. `hasLegacyProfile` short-circuits on the cheap synchronous case
   *      (Profile 0 already registered) so we don't even queue the
   *      cookie read.
   *   2. `#bootstrapInFlight` short-circuits on the async case (one
   *      caller has passed the sync guard and is awaiting cookies; any
   *      other caller that arrives before the await resolves bails out).
   *
   * Both callers (the one-shot from `onAppReady` and the `did-navigate`
   * listener wired in `initialize()`) are wrapped by these guards.
   */
  async bootstrapProfileZeroIfNeeded() {
    // Sync guard: skip if a legacy-partition profile already exists.
    // Checking for the legacy partition specifically (rather than "any
    // profile exists") means a user who already added other profiles
    // before Profile 0 was captured still gets it registered on the next
    // navigation — important because the old "no profiles" guard could
    // leave the legacy login permanently orphaned after a fresh-install
    // user added their second account first.
    const hasLegacyProfile = this.#profilesManager
      .list()
      .some((p) => p.partition === LEGACY_PARTITION);
    if (hasLegacyProfile) return null;

    // Async guard: another caller is between the cookie await and the
    // bootstrap call. Skip rather than racing — they'll add Profile 0
    // and the next did-navigate (if any) will see hasLegacyProfile.
    if (this.#bootstrapInFlight) return null;
    this.#bootstrapInFlight = true;

    try {
      let cookies;
      try {
        cookies = await session
          .fromPartition(LEGACY_PARTITION)
          .cookies.get({});
      } catch (error) {
        console.warn(
          "[ProfileViewManager] Failed to read legacy cookies; skipping bootstrap",
          { message: error.message }
        );
        return null;
      }

      if (!hasAuthCookie(cookies)) {
        console.debug(
          "[ProfileViewManager] Legacy partition has no auth cookies; bootstrap skipped"
        );
        return null;
      }

      const profile = this.#profilesManager.bootstrapLegacyProfile();
      console.info("[ProfileViewManager] Bootstrapped Profile 0", {
        id: profile.id,
      });
      return profile;
    } finally {
      this.#bootstrapInFlight = false;
    }
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
    if (this.#navigationHandler) {
      this.#window.webContents.removeListener(
        "did-navigate",
        this.#navigationHandler
      );
      this.#navigationHandler = null;
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

    // Rebind the in-app screen-share picker on this profile's session.
    // `setDisplayMediaRequestHandler` is per-session and the root window's
    // binding does not carry across to profile partitions (#2529).
    this.#bindDisplayMediaHandler(view.webContents.session);

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
