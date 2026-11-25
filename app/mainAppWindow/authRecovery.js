/**
 * In-app auth recovery (#2622, opt-in via `auth.reauthRecovery.enabled`).
 *
 * Watches renderer auth-failure signals and, when a session can no longer
 * refresh its tokens silently, clears its stale auth state and reloads it for
 * a fresh interactive sign-in. Also intercepts the stale "sign in again"
 * banner's login popup when it correlates with a recent failure signal.
 *
 * Every piece of state is kept per surface: the root window (Profile 0, and
 * the only surface without multi-account) or one multi-account profile view
 * (ADR-020). A signal is credited to the surface that raised it and recovery
 * only ever clears and reloads that surface, so a stale session in one
 * profile never wipes another profile's tokens. Without multi-account every
 * signal belongs to the root window, exactly as before.
 *
 * Pure module (no Electron imports): the clock, timers, settings store,
 * webContents and dialog are injected so the state machine is unit-tested
 * under `node --test`.
 */

// Always-on auth-failure signatures. MSAL reports an interaction-required error
// only when a silent token refresh genuinely fails, so it is a reliable signal to
// recover on. It surfaces in two spellings: the MSAL class name
// `InteractionRequired` (console) and the OAuth error code `interaction_required`
// (the lowercase form thrown by token warming as an unhandled rejection — wired
// into detection by the unhandled-rejection handler in app/index.js).
const AUTH_FAILURE_PATTERNS = ['InteractionRequired', 'interaction_required'];
// Opt-in, correlation-only auth-failure signature. The Teams worker can die with
// an uncaught "UPR: <reason>" error, and a genuinely stale session emits these
// (sometimes without ever logging InteractionRequired, #2480). But the worker
// emits the same "UPR:" shape for routine transient failures (pinned channels,
// presence, "Invalid id undefined", and an empty reason) on perfectly healthy
// sessions, and UPR-heavy tenants fire them constantly (#2629) — far too noisy to
// drive an automatic reload. So when auth.reauthRecovery.enabled is set, a UPR
// only records a failure signal for login-popup correlation (so the banner-click
// in-app recovery can recognise a broken session); it never schedules the silent
// clear-and-reload on its own. Recovery from a UPR happens only through an
// explicit user action (the banner click, or the mid-call prompt).
const OPT_IN_AUTH_FAILURE_PATTERNS = ['Uncaught Error: UPR:'];
// Only trust auth failure signals from Teams/Microsoft origins
const TRUSTED_AUTH_SOURCES = ['teams.cloud.microsoft', 'teams.microsoft.com', 'login.microsoftonline.com'];
// Loop guard for the automatic clear-and-reload. A cooldown rather than a
// single-shot flag: a long-running app can hit a second stale session hours
// after the first recovery (observed in the field: recovery at 10:55, the
// session went stale again at 12:11 and the old once-per-process flag
// silently swallowed it), while the cooldown still prevents rapid
// reload loops if a recovery fails to fix the session.
const AUTH_RECOVERY_COOLDOWN_MS = 30 * 60 * 1000;
// Delay before the automatic recovery runs, to let Teams' own retry mechanism
// attempt recovery first. Also the wait after a call ends before a queued
// recovery runs, so the call teardown finishes before the reload.
const AUTH_RECOVERY_DELAY_MS = 5000;
// A failure signal correlates login popups with an actually-broken session:
// while the stale "sign in again" banner is up the renderer keeps emitting
// failure signatures every few minutes (observed gaps up to ~40 min), whereas
// healthy-session login popups (initial sign-in, consent, step-up MFA, adding
// an account) appear without any preceding failure signal.
const AUTH_FAILURE_SIGNAL_WINDOW_MS = 60 * 60 * 1000;
// The broken session survives an app restart, so the root window's signal
// timestamp must too (observed in the field: app restarted while stale, the
// in-memory timestamp reset, and the banner's Sign In click fell through
// unintercepted). Persisted via the settings store; restored at startup.
// Writes are throttled because failure signatures can repeat at sub-minute
// rates. Deliberately only feeds popup correlation — automatic recovery stays
// driven by live signals so a stale persisted value can never wipe a session
// that a previous run already fixed. Profile views keep theirs in memory
// only: a login popup they do not intercept still opens in the app as a real
// window (profileWindowOpenPolicy.js), where the user can sign in, whereas
// the root window's dies in a hidden window or leaves for the browser.
const AUTH_SIGNAL_STORE_KEY = 'authRecovery.lastFailureSignalAt';
const AUTH_SIGNAL_PERSIST_INTERVAL_MS = 5 * 60 * 1000;
// A single transient worker UPR must not prompt (#2428); require the worker
// signals to persist this long into the same call before treating them as a
// genuine mid-call auth failure.
const MIDCALL_WORKER_SIGNAL_CONFIRM_MS = 3 * 60 * 1000;
// A single banner click can surface as several requests in quick succession
// (and a broken session's own silent-refresh retries produce more), so
// popup-triggered recovery is deduped over a short window. Unlike the
// automatic path's 30-minute cooldown, a deliberate retry a minute later
// should still work.
const POPUP_RECOVERY_DEDUPE_MS = 10 * 1000;

// localStorage key patterns for MSAL/Teams auth tokens
const AUTH_LOCAL_STORAGE_PATTERNS = [
  'tmp.auth.v1.', 'refresh_token', 'msal.token', 'msal.',
  'EncryptionKey', 'authSessionId', 'LogoutState',
  'accessToken', 'idtoken', 'Account', 'Authority', 'ClientInfo',
];

// What started a recovery, which decides what a call that began in the
// meantime does to it (see deferToCall).
const RECOVERY_ORIGIN = Object.freeze({
  SIGNAL: 'signal', // automatic, after a reliable failure signal
  POPUP: 'popup', // an intercepted login popup (banner click)
  QUEUED: 'queued', // "After the call", at the end of that call
  USER: 'user', // "Sign in now": goes ahead even mid-call
});

/** The root window's surface key; every other surface is a profile id. */
const ROOT_SURFACE = Symbol('root');

function newSurfaceState() {
  return {
    lastRecoveryAt: 0,
    lastFailureSignalAt: 0,
    lastSignalPersistAt: 0,
    lastPopupRecoveryAt: 0,
    firstMidCallWorkerSignalAt: 0,
    promptShownForCall: false,
    promptOpen: false,
    recoveryQueuedForCallEnd: false,
  };
}

function resetMidCallState(state) {
  state.firstMidCallWorkerSignalAt = 0;
  state.promptShownForCall = false;
}

/**
 * @param {object} deps
 * @param {() => object} deps.getConfig - Startup config (`auth`, `url`, `chromeUserAgent`)
 * @param {() => {get: Function, set: Function}|null} deps.getSettingsStore
 * @param {() => Electron.WebContents|null} deps.getRootWebContents
 * @param {(session: Electron.Session, forceCleanAll?: boolean) => Promise<object>} deps.cleanAuthCookies
 *   Never rejects (cleanExpiredAuthCookies in mainAppWindow/index.js)
 * @param {(options: object) => Promise<{response: number}>} deps.showMessageBox
 *   Shows the mid-call prompt, parented to the root window
 * @param {() => Iterable<number>} deps.getActiveCallSenderIds - Ids of the
 *   webContents in a call (callRegistry.js), mapped to surfaces here
 * @param {() => number} [deps.now]
 * @param {Function} [deps.setTimer] - setTimeout
 * @param {Function} [deps.runSoon] - setImmediate
 */
function createAuthRecovery({
  getConfig,
  getSettingsStore,
  getRootWebContents,
  cleanAuthCookies,
  showMessageBox,
  getActiveCallSenderIds,
  now = Date.now,
  setTimer = setTimeout,
  runSoon = setImmediate,
}) {
  const states = new Map();
  // profileId → the profile view's webContents, while it lives.
  const views = new Map();
  // Multi-account hooks, null while multi-account is off: then every signal
  // belongs to the root window, as it did before profiles existed.
  let profiles = null;

  function stateOf(surface) {
    let state = states.get(surface);
    if (!state) {
      state = newSurfaceState();
      states.set(surface, state);
    }
    return state;
  }

  // Multi-account only, and never a name or an id: the reader can tell the
  // root window from a profile view, which is all a bug report needs.
  function logContext(surface) {
    return profiles ? [{ isRoot: surface === ROOT_SURFACE }] : [];
  }

  /**
   * The surface a renderer belongs to: the root window, a profile view, or a
   * popup either of them opened (a popup shares its opener's partition, so its
   * owner's session is the one to recover). Null when the sender cannot be
   * attributed (the switcher pill, a dialog, a popup of the root window before
   * Profile 0 exists): such a signal is dropped rather than credited to some
   * other profile.
   *
   * @param {Electron.WebContents|null|undefined} sender
   * @returns {symbol|string|null}
   */
  function resolveSurface(sender) {
    if (!profiles) return ROOT_SURFACE;
    if (!sender || typeof sender.id !== 'number') return null;
    const root = getRootWebContents();
    if (root && sender.id === root.id) return ROOT_SURFACE;
    const profileId = profiles.resolveProfileId(sender);
    if (profileId === null || profileId === undefined) return null;
    if (views.has(profileId)) return profileId;
    // A popup of the root window resolves to Profile 0's id.
    if (root && profileId === profiles.resolveProfileId(root)) return ROOT_SURFACE;
    return null;
  }

  // Worker UPRs are transient during active calls (#2428); suppress them only
  // while a call is in progress so startup recovery still works for
  // stale-token loops (#2480). Only a call in this surface counts (a popup's
  // call counts for its owner): recovery reloads this surface alone, so a
  // call elsewhere neither blocks it nor is ended by it.
  function isInCall(surface) {
    for (const id of getActiveCallSenderIds()) {
      if (resolveSurface({ id }) === surface) return true;
    }
    return false;
  }

  function webContentsOf(surface) {
    if (surface === ROOT_SURFACE) return getRootWebContents();
    return views.get(surface) ?? null;
  }

  function startUrlOf(surface) {
    if (surface === ROOT_SURFACE) return getConfig().url;
    return profiles?.getStartUrl(surface) ?? null;
  }

  // The user-chosen profile name for the prompt, or null without
  // multi-account. Shown to the user only, never logged.
  function profileNameOf(surface) {
    if (!profiles) return null;
    const profileId =
      surface === ROOT_SURFACE
        ? profiles.resolveProfileId(getRootWebContents())
        : surface;
    if (!profileId) return null;
    return profiles.getProfileName(profileId) || null;
  }

  function recordFailureSignal(surface, state) {
    state.lastFailureSignalAt = now();
    if (surface !== ROOT_SURFACE) return;
    if (state.lastFailureSignalAt - state.lastSignalPersistAt < AUTH_SIGNAL_PERSIST_INTERVAL_MS) return;
    state.lastSignalPersistAt = state.lastFailureSignalAt;
    try {
      getSettingsStore()?.set(AUTH_SIGNAL_STORE_KEY, state.lastFailureSignalAt);
    } catch (err) {
      console.warn('[AUTH_RECOVERY] Failed to persist failure signal timestamp:', err.message);
    }
  }

  /**
   * Classifies a renderer-originated message (console output or forwarded
   * window error). Returns null unless it is a trusted auth-failure signal.
   * `sourceId` is the script URL the message came from (console-message
   * sourceId or window-error filename).
   */
  function classify(message, sourceId) {
    // The whole in-app auth-recovery feature (#2622) is opt-in while it
    // stabilises: with auth.reauthRecovery.enabled off, renderer auth-failure
    // signals are ignored entirely and the app keeps its pre-#2622 behaviour
    // (Teams' own stale "sign in again" banner stays up; the user relaunches to
    // re-authenticate). The separate #2296 startup/after-sleep cookie cleaning is
    // unaffected and stays always-on.
    if (!getConfig()?.auth?.reauthRecovery?.enabled) return null;

    const text = message || '';
    // Classify a worker UPR by its shape first, independent of payload contents: a
    // UPR can embed "...code:InteractionRequired..." (StartUpJob/CalendarSyncJob),
    // and matching that as the reliable signal would auto-reload on a UPR despite
    // the correlation-only intent (#2629). So a UPR is never treated as reliable;
    // it only records a correlation signal for the banner interception (the flag is
    // already gated above, so the opt-in worker signal needs no extra flag check).
    const isWorkerUpr = OPT_IN_AUTH_FAILURE_PATTERNS.some(p => text.includes(p));
    const isReliableSignal = !isWorkerUpr && AUTH_FAILURE_PATTERNS.some(p => text.includes(p));
    if (!isReliableSignal && !isWorkerUpr) return null;

    // Verify the message originates from a trusted Microsoft source
    const source = sourceId || '';
    if (source && !TRUSTED_AUTH_SOURCES.some(s => source.includes(s))) return null;
    return { isReliableSignal, source };
  }

  function handleSignal(surface, signal) {
    if (surface === null) {
      console.debug('[AUTH_RECOVERY] Auth failure signal from an unattributed renderer, ignored');
      return;
    }
    const state = stateOf(surface);
    // Record the signal even while recovery is cooling down or a call is
    // active, so the login-popup interception can still correlate against a
    // session that stays broken. For a worker UPR this is the only thing it
    // drives automatically — see the silent-reload guard below.
    recordFailureSignal(surface, state);

    if (now() - state.lastRecoveryAt < AUTH_RECOVERY_COOLDOWN_MS) return;

    if (isInCall(surface)) {
      handleMidCallSignal(surface, state, signal.source);
      return;
    }

    // Outside a call, only the reliable interaction-required signal triggers the
    // silent clear-and-reload. A worker UPR is too noisy to auto-recover on
    // (healthy sessions emit them ~hourly, UPR-heavy tenants constantly — #2629);
    // it has already fed popup correlation above, so it can still drive an in-app
    // recovery via the banner-click intercept, just never silently on its own.
    if (!signal.isReliableSignal) return;

    scheduleRecovery(surface, state);
  }

  function scheduleRecovery(surface, state) {
    state.lastRecoveryAt = now();
    console.info('[AUTH_RECOVERY] Auth failure detected, scheduling recovery', ...logContext(surface));
    setTimer(() => void runRecovery(surface, RECOVERY_ORIGIN.SIGNAL), AUTH_RECOVERY_DELAY_MS);
  }

  function runRecovery(surface, origin) {
    return recover(surface, origin).catch((err) => {
      console.error('[AUTH_RECOVERY] Failed to trigger auth recovery:', err);
    });
  }

  // Every recovery but the user's own "Sign in now" was decided while the
  // surface had no call, and runs later (a timer, setImmediate, the async
  // clean). A call that started in between must not be ended by a silent
  // reload: the user is asked instead, or a recovery already queued for "after
  // the call" waits for this call too. Returns true when it deferred.
  function deferToCall(surface, origin) {
    if (origin === RECOVERY_ORIGIN.USER || !isInCall(surface)) return false;
    if (origin === RECOVERY_ORIGIN.QUEUED) {
      console.info('[AUTH_RECOVERY] A call started before the queued recovery ran, waiting for it to end');
      stateOf(surface).recoveryQueuedForCallEnd = true;
    } else {
      console.info('[AUTH_RECOVERY] A call started before the recovery ran, asking user');
      // The call is new, so its prompt has not been shown yet.
      void promptMidCallReauth(surface, false);
    }
    return true;
  }

  // ── Mid-call handling ──────────────────────────────────────────────────
  // Recovery reloads the page, which ends an active call. Auth can genuinely
  // fail mid-call (the call media keeps flowing but chat stops updating), yet
  // worker UPRs during calls are often transient noise (#2428) — reloading on
  // them mid-presentation was the original bug. So mid-call the user gets a
  // choice (sign in now / after the call / not now) instead of a silent reload.
  function handleMidCallSignal(surface, state, source) {
    const isWorker = source.includes('/worker/');

    if (state.recoveryQueuedForCallEnd) return;

    if (isWorker) {
      const at = now();
      if (!state.firstMidCallWorkerSignalAt) {
        state.firstMidCallWorkerSignalAt = at;
        return;
      }
      if (at - state.firstMidCallWorkerSignalAt < MIDCALL_WORKER_SIGNAL_CONFIRM_MS) return;
    }

    void promptMidCallReauth(surface, false);
  }

  /**
   * Asks the user whether to reauthenticate during an active call. Shown at
   * most once per call for automatic signals; an explicit banner click
   * (force=true) re-prompts even after a "Not now".
   */
  async function promptMidCallReauth(surface, force) {
    const state = stateOf(surface);
    if (state.promptOpen) return;
    if (!force && state.promptShownForCall) return;
    state.promptOpen = true;
    state.promptShownForCall = true;
    try {
      const name = profileNameOf(surface);
      const { response } = await showMessageBox({
        type: 'warning',
        title: 'Sign-in required',
        message: name
          ? `Teams needs you to sign in again to ${name}.`
          : 'Teams needs you to sign in again.',
        detail:
          'Chat and other features may stop updating until you sign in again. ' +
          'Signing in now reloads the app and ends your current call.',
        buttons: ['Sign in now', 'After the call', 'Not now'],
        defaultId: 1,
        cancelId: 2,
      });
      if (response === 0) {
        console.info('[AUTH_RECOVERY] User chose to reauthenticate during call');
        await recover(surface, RECOVERY_ORIGIN.USER);
      } else if (response === 1) {
        console.info('[AUTH_RECOVERY] Recovery queued until the call ends');
        state.recoveryQueuedForCallEnd = true;
      } else {
        console.info('[AUTH_RECOVERY] Mid-call reauth declined');
      }
    } catch (err) {
      console.error('[AUTH_RECOVERY] Mid-call reauth prompt failed:', err);
    } finally {
      state.promptOpen = false;
    }
  }

  /**
   * Clears the surface's stale auth state (localStorage tokens + cookies) and
   * reloads it on its start page to force a fresh interactive login. Unless
   * the user asked for it (`origin` USER), a call in the surface defers it,
   * checked both before the clean and right before the reload.
   */
  async function recover(surface, origin) {
    const target = webContentsOf(surface);
    const url = startUrlOf(surface);
    if (!target || target.isDestroyed() || !url) {
      console.info('[AUTH_RECOVERY] Recovery target is gone, skipped', ...logContext(surface));
      return;
    }
    if (deferToCall(surface, origin)) return;
    console.info('[AUTH_RECOVERY] Clearing auth state and reloading...', ...logContext(surface));

    // Clear localStorage auth tokens via renderer
    try {
      const patternsJson = JSON.stringify(AUTH_LOCAL_STORAGE_PATTERNS);
      const cleared = await target.executeJavaScript(`
      (function() {
        const patterns = ${patternsJson};
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && patterns.some(p => key.includes(p))) {
            keysToRemove.push(key);
          }
        }
        for (const key of keysToRemove) {
          localStorage.removeItem(key);
        }
        return keysToRemove.length;
      })()
    `);
      console.info('[AUTH_RECOVERY] Cleared localStorage auth entries', { count: cleared });
    } catch (err) {
      console.warn('[AUTH_RECOVERY] Failed to clear localStorage:', err.message);
    }

    await cleanAuthCookies(target.session, true);
    // The profile can be removed while its cookies were being cleaned.
    if (target.isDestroyed()) return;
    // A call can start during the clean; the reload would end it.
    if (deferToCall(surface, origin)) return;

    console.info('[AUTH_RECOVERY] Reloading for fresh auth...');
    // Awaited and caught: a superseding navigation rejects with ERR_ABORTED,
    // and the process-wide unhandledRejection handler exits the app (ending
    // calls in other profiles). Only the code is logged, never the URL.
    try {
      await target.loadURL(url, { userAgent: getConfig().chromeUserAgent });
    } catch (error) {
      console.debug('[AUTH_RECOVERY] Recovery reload interrupted', {
        code: error?.code ?? error?.errno,
      });
    }
  }

  /** Clears the surface's mid-call state after it navigated (see below). */
  function onNavigated(surface) {
    const state = states.get(surface);
    if (!state) return;
    // Page reload (including renderer crash recovery) resets renderer-side call
    // state (callRegistry.js drops the call itself), so a missed
    // 'teams-call-disconnected' cannot leave it stuck. A reload also moots any
    // queued recovery: if the session is still broken, fresh signals will
    // re-trigger detection.
    resetMidCallState(state);
    state.recoveryQueuedForCallEnd = false;
  }

  return {
    ROOT_SURFACE,
    resolveSurface,

    /**
     * Multi-account: from here on signals are attributed per profile.
     *
     * @param {{resolveProfileId: (wc: Electron.WebContents) => string|null,
     *   getStartUrl: (profileId: string) => string|null,
     *   getProfileName: (profileId: string) => string|null}} hooks
     */
    setProfiles(hooks) {
      profiles = hooks ?? null;
    },

    /**
     * Wires a profile view as it is created: its console output feeds
     * detection, its navigations reset its call state, and its state goes
     * with it (removal, or the page destroying its own webContents).
     * Returns the cleaning of its session's expired auth cookies (#2296), so
     * the caller can hold the first load until it is done, as the root
     * window's startup does.
     *
     * @param {string} profileId
     * @param {Electron.WebContents} webContents
     * @returns {Promise<object>}
     */
    addProfileView(profileId, webContents) {
      views.set(profileId, webContents);
      const onConsoleMessage = (event) => {
        const signal = classify(event.message, event.sourceId);
        if (signal) handleSignal(profileId, signal);
      };
      const onDidNavigate = () => onNavigated(profileId);
      webContents.on('console-message', onConsoleMessage);
      webContents.on('did-navigate', onDidNavigate);
      webContents.once('destroyed', () => {
        webContents.removeListener('console-message', onConsoleMessage);
        webContents.removeListener('did-navigate', onDidNavigate);
        if (views.get(profileId) !== webContents) return;
        views.delete(profileId);
        states.delete(profileId);
      });
      return cleanAuthCookies(webContents.session);
    },

    /** Restores the root window's persisted signal for popup correlation. */
    restoreFailureSignal() {
      stateOf(ROOT_SURFACE).lastFailureSignalAt =
        Number(getSettingsStore().get(AUTH_SIGNAL_STORE_KEY)) || 0;
    },

    /**
     * Detection entry point for a renderer message from a known surface
     * (the root window's console output).
     */
    onSurfaceMessage(surface, message, sourceId) {
      const signal = classify(message, sourceId);
      if (signal) handleSignal(surface, signal);
    },

    /**
     * Detection entry point for a renderer error forwarded over IPC
     * (window-error, unhandled-rejection), attributed by its sender.
     */
    onRendererError(message, sourceId, sender) {
      const signal = classify(message, sourceId);
      if (signal) handleSignal(resolveSurface(sender), signal);
    },

    /**
     * Decides whether an outgoing Microsoft login popup from `surface` should
     * be intercepted for in-app auth recovery. Requires both the
     * auth.reauthRecovery.enabled opt-in and a trusted auth-failure signal
     * from that same surface within the correlation window, so login popups
     * from healthy-session flows (initial sign-in, consent, step-up MFA,
     * adding an account) are never diverted.
     */
    shouldInterceptPopup(surface) {
      if (!getConfig().auth?.reauthRecovery?.enabled) return false;
      if (surface === null) return false;
      const lastSignalAt = states.get(surface)?.lastFailureSignalAt ?? 0;
      return now() - lastSignalAt < AUTH_FAILURE_SIGNAL_WINDOW_MS;
    },

    triggerPopupRecovery(surface, context) {
      const state = stateOf(surface);
      const at = now();
      if (at - state.lastPopupRecoveryAt < POPUP_RECOVERY_DEDUPE_MS) return;
      state.lastPopupRecoveryAt = at;
      if (isInCall(surface)) {
        // Recovery would end the active call — let the user decide. force=true:
        // an explicit click re-prompts even after an earlier "Not now".
        console.info(`[AUTH_RECOVERY] ${context} during an active call, asking user`, ...logContext(surface));
        void promptMidCallReauth(surface, true);
        return;
      }
      console.info(`[AUTH_RECOVERY] ${context}, triggering in-app recovery`, ...logContext(surface));
      runSoon(() => void runRecovery(surface, RECOVERY_ORIGIN.POPUP));
    },

    /**
     * `teams-call-connected`, after callRegistry.js recorded the call: a new
     * call in the sender's surface starts with a fresh mid-call state.
     */
    onCallConnected(sender) {
      const surface = resolveSurface(sender);
      if (surface === null) return;
      resetMidCallState(stateOf(surface));
    },

    /**
     * `teams-call-disconnected`, after callRegistry.js dropped the call. Once
     * the sender's surface has no call left, runs the recovery the user queued
     * for the end of that call, and returns the webContents it will reload
     * (null when none was queued) so a deep link held for the same surface
     * can give way to it.
     *
     * @returns {Electron.WebContents|null}
     */
    onCallDisconnected(sender) {
      const surface = resolveSurface(sender);
      if (surface === null) return null;
      const state = stateOf(surface);
      resetMidCallState(state);
      if (!state.recoveryQueuedForCallEnd || isInCall(surface)) return null;
      state.recoveryQueuedForCallEnd = false;
      console.info('[AUTH_RECOVERY] Call ended, running queued recovery');
      // Short delay so the call teardown finishes before the reload
      setTimer(() => void runRecovery(surface, RECOVERY_ORIGIN.QUEUED), AUTH_RECOVERY_DELAY_MS);
      return webContentsOf(surface);
    },

    onNavigated,

    /**
     * After a resume from sleep, removes the auth cookies that expired during
     * suspend (#2296) from every live session: the root window's first, then
     * each profile view's. Always on, like the startup clean.
     */
    async cleanAfterResume() {
      const sessions = [];
      const root = getRootWebContents();
      if (root && !root.isDestroyed()) sessions.push(root.session);
      for (const webContents of views.values()) {
        if (!webContents.isDestroyed()) sessions.push(webContents.session);
      }
      for (const session of sessions) {
        const result = await cleanAuthCookies(session);
        if (result.expired > 0) {
          console.info('[AUTH_RECOVERY] Cleaned expired cookies after resume', {
            cleaned: result.cleaned,
            expired: result.expired,
          });
          // Let Teams' own MSAL retry handle re-authentication rather than
          // triggering full recovery which clears all auth state (issue #2364)
        }
      }
    },
  };
}

module.exports = {
  createAuthRecovery,
  ROOT_SURFACE,
  AUTH_SIGNAL_STORE_KEY,
};
