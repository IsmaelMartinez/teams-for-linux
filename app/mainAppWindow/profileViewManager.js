const { WebContentsView, session, ipcMain } = require("electron");
const path = require("node:path");

const LEGACY_PARTITION = "persist:teams-4-linux";

// Height (px) of the top switcher chrome strip reserved above profile views.
// Single source of truth: the inset applied to profile views, the collapsed
// strip height, the renderer CSS, and the e2e bounds assertion all reference
// this. Exported on the class below.
const SWITCHER_CHROME_HEIGHT = 40;

// When the pill's dropdown is open the strip temporarily grows to cover the
// FULL content area so its scrim dims the whole app (and a click anywhere
// outside the dropdown dismisses it) — standard modal-menu backdrop. Profile
// views stay inset at SWITCHER_CHROME_HEIGHT; the expanded strip just paints
// over the content while open, then collapses back to the bar.

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
  // The top switcher chrome strip (a single persistent WebContentsView held
  // separately from #views so #hideAllOverlays never detaches it).
  #chromeView = null;
  #chromeExpanded = false;
  #setExpandedHandler = null;

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
      update: () => this.#pushSwitcherState(),
      switch: (profile) => this.#onSwitch(profile),
      remove: (result) => this.#onRemove(result),
    };
    this.#profilesManager.on("add", this.#handlers.add);
    this.#profilesManager.on("update", this.#handlers.update);
    this.#profilesManager.on("switch", this.#handlers.switch);
    this.#profilesManager.on("remove", this.#handlers.remove);

    this.#resizeHandler = () => this.#applyBoundsToAll();
    this.#window.on("resize", this.#resizeHandler);

    // Only act on events from our own strip's webContents. Returns once the
    // bounds are applied so the renderer can await before revealing the
    // dropdown (avoids a first-open clip while the strip is still collapsed).
    this.#setExpandedHandler = (event, expanded) => {
      if (!this.#chromeView || event.sender !== this.#chromeView.webContents) {
        return;
      }
      this.#chromeExpanded = !!expanded;
      this.#applyChromeBounds();
      this.#raiseChrome();
    };
    // Grow/shrink the switcher strip so its dropdown is not clipped by the
    // collapsed 40px height; the renderer toggles this on dropdown open/close.
    ipcMain.handle("profile-switcher-set-expanded", this.#setExpandedHandler);

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

    // Create the switcher chrome strip LAST so it sits above the active
    // profile view. From here on, every #showActive re-raises it (adding a
    // profile view would otherwise paint over it).
    this.#createChromeView();
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
      this.#profilesManager.off("update", this.#handlers.update);
      this.#profilesManager.off("switch", this.#handlers.switch);
      this.#profilesManager.off("remove", this.#handlers.remove);
      this.#handlers = null;
    }
    if (this.#setExpandedHandler) {
      ipcMain.removeHandler("profile-switcher-set-expanded");
      this.#setExpandedHandler = null;
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
    if (this.#chromeView) {
      try {
        this.#window.contentView.removeChildView(this.#chromeView);
      } catch {
        // Already detached; ignore.
      }
      if (!this.#chromeView.webContents.isDestroyed()) {
        this.#chromeView.webContents.close();
      }
      this.#chromeView = null;
    }
    this.#initialized = false;
  }

  // --- Event handlers --------------------------------------------------

  #onAdd(profile) {
    // Profile 0 (legacy partition) lives on the root window; no overlay
    // needed. Other profiles get a WebContentsView. Either way the strip
    // must re-render to show the new profile.
    if (profile.partition !== LEGACY_PARTITION) {
      this.#createView(profile);
    }
    this.#pushSwitcherState();
  }

  #onSwitch(profile) {
    this.#showActive(profile);
    this.#pushSwitcherState();
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
      this.#raiseChrome();
    }
    this.#pushSwitcherState();
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
      // Profile 0 is the root window; just hide all overlays. The strip
      // stays put (it's not in #views) and is re-raised below.
      this.#hideAllOverlays();
      this.#raiseChrome();
      return;
    }
    this.#hideAllOverlays();
    const view = this.#views.get(profile.id);
    if (!view) {
      console.warn(
        "[ProfileViewManager] No view for active profile; nothing to show",
        { profileId: profile.id }
      );
      this.#raiseChrome();
      return;
    }
    this.#applyBounds(view);
    this.#window.contentView.addChildView(view);
    // Adding the profile view puts it on top; re-raise the strip so it stays
    // above the active content.
    this.#raiseChrome();
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
    this.#applyChromeBounds();
  }

  #applyBounds(view) {
    // Inset profile views below the switcher chrome strip. Clamp the height so
    // a degenerate tiny window can't produce a negative dimension. Profile 0
    // (root window webContents) is NOT inset — the strip simply overlaps its
    // empty top ~40px title-bar region (deliberate tradeoff, see README/ADR).
    const [width, height] = this.#window.getContentSize();
    view.setBounds({
      x: 0,
      y: SWITCHER_CHROME_HEIGHT,
      width,
      height: Math.max(0, height - SWITCHER_CHROME_HEIGHT),
    });
  }

  // --- Switcher chrome strip -------------------------------------------

  #createChromeView() {
    // The strip renders our own vanilla HTML/CSS and never touches Teams'
    // DOM, so it can be fully hardened (contextIsolation + sandbox), unlike
    // the profile views which need ReactHandler access.
    const view = new WebContentsView({
      webPreferences: {
        preload: path.join(__dirname, "..", "profileSwitcher", "preload.js"),
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
      },
    });
    this.#chromeView = view;
    // Transparent so only the opaque 40px bar and the dropdown card paint;
    // while expanded, the page's scrim dims the Teams content behind it
    // instead of covering it with a solid block.
    view.setBackgroundColor("#00000000");
    this.#applyChromeBounds();
    this.#window.contentView.addChildView(view);
    view.webContents.loadFile(
      path.join(__dirname, "..", "profileSwitcher", "switcher.html")
    );
    // Push the initial profile state once the renderer is ready. The renderer
    // also pulls state itself on load (via profile-list / profile-get-active),
    // so this is belt-and-suspenders against push/load ordering.
    view.webContents.once("did-finish-load", () => this.#pushSwitcherState());
  }

  #applyChromeBounds() {
    if (!this.#chromeView) return;
    const [width, height] = this.#window.getContentSize();
    // Expanded: cover the whole content area (full-app scrim + click-anywhere
    // dismiss). Collapsed: just the 40px bar.
    this.#chromeView.setBounds({
      x: 0,
      y: 0,
      width,
      height: this.#chromeExpanded ? height : SWITCHER_CHROME_HEIGHT,
    });
  }

  // Re-assert the strip as the topmost child. addChildView on an already
  // attached view moves it to the top of the z-order.
  #raiseChrome() {
    if (!this.#chromeView) return;
    try {
      this.#window.contentView.addChildView(this.#chromeView);
    } catch {
      // View may be mid-teardown; ignore.
    }
  }

  #pushSwitcherState() {
    if (!this.#chromeView || this.#chromeView.webContents.isDestroyed()) {
      return;
    }
    const active = this.#profilesManager.getActive();
    this.#chromeView.webContents.send("profile-switcher-state", {
      profiles: this.#profilesManager.list(),
      activeId: active ? active.id : null,
    });
  }
}

module.exports = ProfileViewManager;
module.exports.SWITCHER_CHROME_HEIGHT = SWITCHER_CHROME_HEIGHT;
