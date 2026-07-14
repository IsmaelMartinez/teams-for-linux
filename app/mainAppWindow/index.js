const {
  shell,
  BrowserWindow,
  app,
  nativeTheme,
  dialog,
  webFrameMain,
  nativeImage,
  desktopCapturer,
  ipcMain,
  MessageChannelMain,
} = require("electron");
const { StreamSelector } = require("../screenSharing");
const login = require("../login");
const customCSS = require("../customCSS");
const Menus = require("../menus");
const { SpellCheckProvider } = require("../spellCheckProvider");
const { execFile } = require("node:child_process");
const TrayIconChooser = require("../browser/tools/trayIconChooser");
require("../appConfiguration");
const ConnectionManager = require("../connectionManager");
const BrowserWindowManager = require("../mainAppWindow/browserWindowManager");
const os = require("node:os");
const path = require("node:path");

const DEFAULT_SCREEN_SHARING_THUMBNAIL_CONFIG = {
  enabled: true,
  alwaysOnTop: true,
};

let iconChooser;
let intune;
let isControlPressed = false;
// ProfilesManager handle threaded through onAppReady so the Menus
// instance can build the Profiles submenu and react to its events.
let profilesManagerRef = null;
// Counter for tracking about:blank navigation attempts to handle authentication flows.
// Teams sometimes navigates to about:blank during SSO/auth redirects, and we need to
// intercept these and handle them in a hidden window to complete the auth process.
let aboutBlankRequestCount = 0;
let config;
let window = null;
let appConfig = null;
let customBackgroundService = null;
let streamSelector;
let screenSharingService = null;
let connectionManager = null;
let menus = null;

const isMac = os.platform() === "darwin";

function findSelectedSource(sources, source) {
  return sources.find((s) => s.id === source.id);
}

function setupScreenSharing(selectedSource) {
  screenSharingService.setSelectedSource(selectedSource);
  createScreenSharePreviewWindow();
}

// Register the in-app screen-share picker on a given session. `setDisplayMediaRequestHandler`
// fires only for the session it is bound to, so multi-account profile views (running against
// their own partition session) need their own binding. See #2529.
function bindDisplayMediaHandler(targetSession) {
  targetSession.setDisplayMediaRequestHandler((_request, callback) => {
    streamSelector.show((source) => {
      if (source) {
        handleScreenSourceSelection(source, callback);
      } else {
        // User canceled - use setImmediate and try-catch to allow retry
        setImmediate(() => {
          try {
            callback({});
          } catch {
            console.debug("[SCREEN_SHARE] User canceled screen selection");
          }
        });
      }
    });
  });
}

function handleScreenSourceSelection(source, callback) {
  desktopCapturer
    .getSources({ types: ["window", "screen"] })
    .then((sources) => {
      const selectedSource = findSelectedSource(sources, source);
      if (selectedSource) {
        setupScreenSharing(selectedSource);
        callback({ video: selectedSource });
      } else {
        // Source not found - use setImmediate and try-catch to allow retry
        setImmediate(() => {
          try {
            callback({});
          } catch {
            console.debug("[SCREEN_SHARE] Selected source not found");
          }
        });
      }
    })
    .catch((error) => {
      // Handle desktopCapturer failures gracefully - can crash on certain hardware
      // configurations (USB-C docking stations, DisplayLink drivers, etc.)
      // See issues #2058, #2041
      console.error("[SCREEN_SHARE] Failed to get sources for selection:", {
        error: error.message,
        stack: error.stack,
        sourceId: source?.id
      });
      setImmediate(() => {
        try {
          callback({});
        } catch {
          console.debug("[SCREEN_SHARE] Failed to complete screen selection callback");
        }
      });
    });
}

function createScreenSharePreviewWindow() {
  const startTime = Date.now();

  let thumbnailConfig =
    config?.screenSharing?.thumbnail ?? DEFAULT_SCREEN_SHARING_THUMBNAIL_CONFIG;

  const previewWindow = screenSharingService.getPreviewWindow();
  const activeSource = screenSharingService.getSelectedSource();

  console.debug("[SCREEN_SHARE_DIAG] Preview window creation requested", {
    enabled: thumbnailConfig.enabled,
    alwaysOnTop: thumbnailConfig.alwaysOnTop || false,
    existingWindow: previewWindow && !previewWindow.isDestroyed(),
    activeSource: activeSource,
    timestamp: new Date().toISOString()
  });

  if (!thumbnailConfig.enabled) {
    console.debug("[SCREEN_SHARE_DIAG] Preview window disabled in configuration");
    return;
  }

  // Don't create duplicate windows - this is critical for preventing echo
  if (previewWindow && !previewWindow.isDestroyed()) {
    console.warn("[SCREEN_SHARE_DIAG] Preview window already exists, focusing existing", {
      riskLevel: "MEDIUM - multiple preview windows could cause audio issues",
      action: "focusing existing window instead of creating new",
      windowId: previewWindow.id
    });
    previewWindow.focus();
    return;
  }

  console.debug("[SCREEN_SHARE_DIAG] Creating new preview window", {
    dimensions: "320x180",
    alwaysOnTop: thumbnailConfig.alwaysOnTop || false,
    partition: "persist:teams-for-linux-session"
  });

  const newPreviewWindow = new BrowserWindow({
    width: 320,
    height: 180,
    minWidth: 200,
    minHeight: 120,
    show: false,
    resizable: true,
    alwaysOnTop: thumbnailConfig.alwaysOnTop || false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(
        __dirname,
        "..",
        "screenSharing",
        "previewWindowPreload.js"
      ),
      partition: "persist:teams-for-linux-session",
    },
  });

  screenSharingService.setPreviewWindow(newPreviewWindow);

  const windowId = newPreviewWindow.id;
  console.debug("[SCREEN_SHARE_DIAG] Preview BrowserWindow created", {
    windowId: windowId,
    creationTimeMs: Date.now() - startTime,
    alwaysOnTop: thumbnailConfig.alwaysOnTop || false
  });

  newPreviewWindow.loadFile(
    path.join(__dirname, "..", "screenSharing", "previewWindow.html")
  );

  newPreviewWindow.once("ready-to-show", () => {
    console.debug("[SCREEN_SHARE_DIAG] Preview window ready, showing now", {
      windowId: windowId,
      totalCreationTimeMs: Date.now() - startTime,
      focused: newPreviewWindow.isFocused(),
      visible: newPreviewWindow.isVisible()
    });
    newPreviewWindow.show();
  });

  newPreviewWindow.on("focus", () => {
    console.debug("[SCREEN_SHARE_DIAG] Preview window gained focus", {
      windowId: windowId,
      potentialIssue: "Focus on preview might interfere with main Teams window"
    });
  });

  newPreviewWindow.on("blur", () => {
    console.debug("[SCREEN_SHARE_DIAG] Preview window lost focus", {
      windowId: windowId
    });
  });

  newPreviewWindow.on("closed", () => {
    const closedSource = screenSharingService.getSelectedSource();
    console.debug("[SCREEN_SHARE_DIAG] Preview window closed", {
      windowId: windowId,
      hadActiveSource: !!closedSource,
      closedSource: closedSource
    });
    screenSharingService.setPreviewWindow(null);
    screenSharingService.setSelectedSource(null);
  });
}

// Microsoft Cloud App Security proxy suffix. Tenants that route Teams
// through Defender for Cloud Apps (MCAS) load and store cookies at
// `*.mcas.ms` rather than the underlying Microsoft domain. Strip the
// suffix before matching against AUTH_DOMAINS / TEAMS_DOMAINS so the
// proxied flavour is treated the same as the canonical hostname.
const MCAS_SUFFIX = '.mcas.ms';
function stripMcasSuffix(hostname) {
  return hostname.endsWith(MCAS_SUFFIX)
    ? hostname.slice(0, -MCAS_SUFFIX.length)
    : hostname;
}

// Microsoft auth domains whose cookies should be checked/cleaned
const AUTH_DOMAINS = [
  'login.microsoftonline.com',
  'login.microsoft.com',
  'teams.microsoft.com',
  'teams.cloud.microsoft',
  'microsoft.com',
  'office.com',
  'office365.com',
  'live.com',
  'microsoftonline.com',
];

// Azure AD / MSAL / SharePoint auth cookie names
const AUTH_COOKIE_NAMES = new Set([
  'ESTSAUTH',
  'ESTSAUTHPERSISTENT',
  'ESTSAUTHLIGHT',
  'SignInStateCookie',
  'AADSSO',
  'buid',
  'fpc',
  'x-ms-gateway-slice',
  'stsservicecookie',
  'CCState',
  'FedAuth',
  'rtFa',
]);

// Auth cookies preserved during force-clean recovery so the Microsoft
// account chooser stays prefilled after session expiry (issue #2364).
const PRESERVE_ON_RECOVERY = new Set(['ESTSAUTHPERSISTENT']);

// localStorage key patterns for MSAL/Teams auth tokens
const AUTH_LOCAL_STORAGE_PATTERNS = [
  'tmp.auth.v1.', 'refresh_token', 'msal.token', 'msal.',
  'EncryptionKey', 'authSessionId', 'LogoutState',
  'accessToken', 'idtoken', 'Account', 'Authority', 'ClientInfo',
  'secure_teams_'
];

/**
 * Checks session cookies for Microsoft auth domains and removes expired
 * or removable auth cookies. When forceCleanAll is true, removes all auth
 * cookies except those in PRESERVE_ON_RECOVERY (e.g. ESTSAUTHPERSISTENT)
 * so the next interactive login can still show the remembered-account banner.
 * @returns {{ cleaned: number, total: number, expired: number }}
 */
async function cleanExpiredAuthCookies(windowSession, forceCleanAll = false) {
  try {
    const allCookies = await windowSession.cookies.get({});
    const nowSeconds = Date.now() / 1000;

    const authCookies = allCookies.filter(cookie => {
      const domain = stripMcasSuffix((cookie.domain || '').replace(/^\./, ''));
      const isAuthDomain = AUTH_DOMAINS.some(d => domain === d || domain.endsWith('.' + d));
      return isAuthDomain && AUTH_COOKIE_NAMES.has(cookie.name);
    });

    const expired = authCookies.filter(c => c.expirationDate && c.expirationDate < nowSeconds);
    const cookiesToRemove = forceCleanAll
      ? authCookies.filter(c => !PRESERVE_ON_RECOVERY.has(c.name))
      : expired;

    if (cookiesToRemove.length === 0) {
      console.debug('[AUTH_RECOVERY] Cookie check:', { total: authCookies.length, expired: expired.length });
      return { cleaned: 0, total: authCookies.length, expired: expired.length };
    }

    console.info('[AUTH_RECOVERY] Cleaning auth cookies:', {
      mode: forceCleanAll ? 'force-all' : 'expired-only',
      removing: cookiesToRemove.length,
      total: authCookies.length,
    });

    const results = await Promise.all(cookiesToRemove.map(async (cookie) => {
      try {
        const protocol = cookie.secure ? 'https' : 'http';
        const domain = cookie.domain.startsWith('.') ? cookie.domain.substring(1) : cookie.domain;
        const url = `${protocol}://${domain}${cookie.path || '/'}`;
        await windowSession.cookies.remove(url, cookie.name);
        return true;
      } catch (err) {
        console.warn('[AUTH_RECOVERY] Failed to remove cookie:', { name: cookie.name, error: err.message });
        return false;
      }
    }));
    const removedCount = results.filter(Boolean).length;

    console.info(`[AUTH_RECOVERY] Cleaned ${removedCount}/${cookiesToRemove.length} auth cookies`);
    return { cleaned: removedCount, total: authCookies.length, expired: expired.length };
  } catch (error) {
    console.error('[AUTH_RECOVERY] Cookie check failed:', error.message);
    return { cleaned: 0, total: 0, expired: 0 };
  }
}

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
let lastAuthRecoveryAt = 0;
const AUTH_RECOVERY_COOLDOWN_MS = 30 * 60 * 1000;
// Worker UPRs are transient during active calls (#2428); suppress them only while
// a call is in progress so startup recovery still works for stale-token loops (#2480).
let callActive = false;
// Timestamp of the last trusted auth-failure signal. Used to correlate login
// popups with an actually-broken session: while the stale "sign in again"
// banner is up the renderer keeps emitting failure signatures every few
// minutes (observed gaps up to ~40 min), whereas healthy-session login popups
// (initial sign-in, consent, step-up MFA, adding an account) appear without
// any preceding failure signal.
let lastAuthFailureSignalAt = 0;
const AUTH_FAILURE_SIGNAL_WINDOW_MS = 60 * 60 * 1000;
// The broken session survives an app restart, so the signal timestamp must
// too (observed in the field: app restarted while stale, the in-memory
// timestamp reset, and the banner's Sign In click fell through unintercepted).
// Persisted via the settings store; restored in onAppReady. Writes are
// throttled because failure signatures can repeat at sub-minute rates.
// Deliberately only feeds popup correlation — automatic recovery stays
// driven by live signals so a stale persisted value can never wipe a
// session that a previous run already fixed.
const AUTH_SIGNAL_STORE_KEY = 'authRecovery.lastFailureSignalAt';
const AUTH_SIGNAL_PERSIST_INTERVAL_MS = 5 * 60 * 1000;
let lastAuthSignalPersistAt = 0;

function recordAuthFailureSignal() {
  lastAuthFailureSignalAt = Date.now();
  if (lastAuthFailureSignalAt - lastAuthSignalPersistAt < AUTH_SIGNAL_PERSIST_INTERVAL_MS) return;
  lastAuthSignalPersistAt = lastAuthFailureSignalAt;
  try {
    appConfig?.settingsStore?.set(AUTH_SIGNAL_STORE_KEY, lastAuthFailureSignalAt);
  } catch (err) {
    console.warn('[AUTH_RECOVERY] Failed to persist failure signal timestamp:', err.message);
  }
}

/**
 * Checks a renderer-originated message (console output or forwarded window
 * error) for auth-failure signatures and schedules recovery on a match.
 * `sourceId` is the script URL the message came from (console-message
 * sourceId or window-error filename).
 */
function maybeScheduleAuthRecovery(message, sourceId) {
  // The whole in-app auth-recovery feature (#2622) is opt-in while it
  // stabilises: with auth.reauthRecovery.enabled off, renderer auth-failure
  // signals are ignored entirely and the app keeps its pre-#2622 behaviour
  // (Teams' own stale "sign in again" banner stays up; the user relaunches to
  // re-authenticate). The separate #2296 startup/after-sleep cookie cleaning is
  // unaffected and stays always-on.
  if (!config?.auth?.reauthRecovery?.enabled) return;

  const text = message || '';
  // Classify a worker UPR by its shape first, independent of payload contents: a
  // UPR can embed "...code:InteractionRequired..." (StartUpJob/CalendarSyncJob),
  // and matching that as the reliable signal would auto-reload on a UPR despite
  // the correlation-only intent (#2629). So a UPR is never treated as reliable;
  // it only records a correlation signal for the banner interception (the flag is
  // already gated above, so the opt-in worker signal needs no extra flag check).
  const isWorkerUpr = OPT_IN_AUTH_FAILURE_PATTERNS.some(p => text.includes(p));
  const isReliableSignal = !isWorkerUpr && AUTH_FAILURE_PATTERNS.some(p => text.includes(p));
  const isOptInWorkerSignal = isWorkerUpr;
  if (!isReliableSignal && !isOptInWorkerSignal) return;

  // Verify the message originates from a trusted Microsoft source
  const source = sourceId || '';
  if (source && !TRUSTED_AUTH_SOURCES.some(s => source.includes(s))) return;

  // Record the signal even while recovery is cooling down or a call is
  // active, so the login-popup interception can still correlate against a
  // session that stays broken. For a worker UPR this is the only thing it
  // drives automatically — see the silent-reload guard below.
  recordAuthFailureSignal();

  if (Date.now() - lastAuthRecoveryAt < AUTH_RECOVERY_COOLDOWN_MS) return;

  if (callActive) {
    handleMidCallAuthSignal(source);
    return;
  }

  // Outside a call, only the reliable interaction-required signal triggers the
  // silent clear-and-reload. A worker UPR is too noisy to auto-recover on
  // (healthy sessions emit them ~hourly, UPR-heavy tenants constantly — #2629);
  // it has already fed popup correlation above, so it can still drive an in-app
  // recovery via the banner-click intercept, just never silently on its own.
  if (!isReliableSignal) return;

  scheduleAuthRecovery();
}

function scheduleAuthRecovery() {
  lastAuthRecoveryAt = Date.now();
  console.info('[AUTH_RECOVERY] Auth failure detected, scheduling recovery');

  // Delay to let Teams' own retry mechanism attempt recovery first
  setTimeout(
    () =>
      triggerAuthRecovery().catch((err) => {
        console.error('[AUTH_RECOVERY] Failed to trigger auth recovery:', err);
      }),
    5000
  );
}

// ── Mid-call handling ──────────────────────────────────────────────────────
// Recovery reloads the page, which ends an active call. Auth can genuinely
// fail mid-call (the call media keeps flowing but chat stops updating), yet
// worker UPRs during calls are often transient noise (#2428) — reloading on
// them mid-presentation was the original bug. So mid-call the user gets a
// choice (sign in now / after the call / not now) instead of a silent reload.
let firstMidCallWorkerSignalAt = 0;
let reauthPromptShownForCall = false;
let reauthPromptOpen = false;
let recoveryQueuedForCallEnd = false;
// A single transient worker UPR must not prompt (#2428); require the worker
// signals to persist this long into the same call before treating them as a
// genuine mid-call auth failure.
const MIDCALL_WORKER_SIGNAL_CONFIRM_MS = 3 * 60 * 1000;

function resetMidCallAuthState() {
  firstMidCallWorkerSignalAt = 0;
  reauthPromptShownForCall = false;
}

function handleMidCallAuthSignal(source) {
  // Only reached with auth.reauthRecovery.enabled on (maybeScheduleAuthRecovery
  // gates the whole feature), so the user always gets the mid-call prompt rather
  // than a silent reload that would end the call.
  const isWorker = source.includes('/worker/');

  if (recoveryQueuedForCallEnd) return;

  if (isWorker) {
    const now = Date.now();
    if (!firstMidCallWorkerSignalAt) {
      firstMidCallWorkerSignalAt = now;
      return;
    }
    if (now - firstMidCallWorkerSignalAt < MIDCALL_WORKER_SIGNAL_CONFIRM_MS) return;
  }

  promptMidCallReauth(false);
}

/**
 * Asks the user whether to reauthenticate during an active call. Shown at
 * most once per call for automatic signals; an explicit banner click
 * (force=true) re-prompts even after a "Not now".
 */
async function promptMidCallReauth(force) {
  if (reauthPromptOpen) return;
  if (!force && reauthPromptShownForCall) return;
  reauthPromptOpen = true;
  reauthPromptShownForCall = true;
  try {
    const { response } = await dialog.showMessageBox(window, {
      type: 'warning',
      title: 'Sign-in required',
      message: 'Teams needs you to sign in again.',
      detail:
        'Chat and other features may stop updating until you sign in again. ' +
        'Signing in now reloads the app and ends your current call.',
      buttons: ['Sign in now', 'After the call', 'Not now'],
      defaultId: 1,
      cancelId: 2,
    });
    if (response === 0) {
      console.info('[AUTH_RECOVERY] User chose to reauthenticate during call');
      await triggerAuthRecovery();
    } else if (response === 1) {
      console.info('[AUTH_RECOVERY] Recovery queued until the call ends');
      recoveryQueuedForCallEnd = true;
    } else {
      console.info('[AUTH_RECOVERY] Mid-call reauth declined');
    }
  } catch (err) {
    console.error('[AUTH_RECOVERY] Mid-call reauth prompt failed:', err);
  } finally {
    reauthPromptOpen = false;
  }
}

/**
 * Decides whether an outgoing Microsoft login popup should be intercepted
 * for in-app auth recovery. Requires both the auth.reauthRecovery.enabled
 * opt-in and a trusted auth-failure signal within the correlation window,
 * so login popups from healthy-session flows (initial sign-in, consent,
 * step-up MFA, adding an account) are never diverted — they fall through
 * to the default link handling.
 */
function shouldInterceptAuthPopup() {
  if (!config.auth?.reauthRecovery?.enabled) return false;
  return Date.now() - lastAuthFailureSignalAt < AUTH_FAILURE_SIGNAL_WINDOW_MS;
}

// A single banner click can surface as several requests in quick succession
// (and a broken session's own silent-refresh retries produce more), so
// popup-triggered recovery is deduped over a short window. Unlike the
// automatic path's 30-minute cooldown, a deliberate retry a minute later
// should still work.
let lastPopupRecoveryAt = 0;
const POPUP_RECOVERY_DEDUPE_MS = 10 * 1000;

function triggerPopupRecovery(context) {
  const now = Date.now();
  if (now - lastPopupRecoveryAt < POPUP_RECOVERY_DEDUPE_MS) return;
  lastPopupRecoveryAt = now;
  if (callActive) {
    // Recovery would end the active call — let the user decide. force=true:
    // an explicit click re-prompts even after an earlier "Not now".
    console.info(`[AUTH_RECOVERY] ${context} during an active call, asking user`);
    promptMidCallReauth(true);
    return;
  }
  console.info(`[AUTH_RECOVERY] ${context}, triggering in-app recovery`);
  setImmediate(() =>
    triggerAuthRecovery().catch((err) => {
      console.error('[AUTH_RECOVERY] Failed to trigger auth recovery:', err);
    })
  );
}

/**
 * Clears stale auth state (localStorage tokens + cookies) and reloads
 * the page to force a fresh interactive login.
 */
async function triggerAuthRecovery() {
  console.info('[AUTH_RECOVERY] Clearing auth state and reloading...');

  // Clear localStorage auth tokens via renderer
  try {
    const patternsJson = JSON.stringify(AUTH_LOCAL_STORAGE_PATTERNS);
    const cleared = await window.webContents.executeJavaScript(`
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

  await cleanExpiredAuthCookies(window.webContents.session, true);

  console.info('[AUTH_RECOVERY] Reloading for fresh auth...');
  window.loadURL(config.url, { userAgent: config.chromeUserAgent });
}

exports.onAppReady = async function onAppReady(configGroup, customBackground, sharingService, profilesManager = null) {
  appConfig = configGroup;
  config = configGroup.startupConfig;
  customBackgroundService = customBackground;
  screenSharingService = sharingService;
  profilesManagerRef = profilesManager;

  const intuneEnabled = config.auth?.intune?.enabled;
  const intuneUser = config.auth?.intune?.user ?? "";
  if (intuneEnabled) {
    intune = require("../intune");
    await intune.initSso(intuneUser);
  }

  if (config.trayIconEnabled) {
    iconChooser = new TrayIconChooser(config);

    if (isMac) {
      console.info("Setting Dock icon for macOS");

      // macOS requires >=128x128 for the dock; use the 256x256 asset by default.
      const DEFAULT_MACOS_DOCK_ICON = "assets/icons/icon-256x256.png";
      const dockIconPath = config.appIcon && config.appIcon.trim() !== ""
        ? config.appIcon
        : path.join(config.appPath, DEFAULT_MACOS_DOCK_ICON);

      const icon = nativeImage.createFromPath(dockIconPath);
      const iconSize = icon.getSize();

      if (iconSize.width < 128) {
        console.warn(
          `Unable to set dock icon for macOS, icon size is less than 128x128, current size ${iconSize.width}x${iconSize.height}. Using resized icon.`
        );
        const resizedIcon = icon.resize({ width: 128, height: 128 });
        app.dock.setIcon(resizedIcon);
      } else {
        app.dock.setIcon(icon);
      }
    }
  }

  const browserWindowManager = new BrowserWindowManager({
    config: config,
    iconChooser: iconChooser,
  });

  window = await browserWindowManager.createWindow();
  streamSelector = new StreamSelector(window);

  // Restrict WebRTC ICE candidate gathering to the interface with the default
  // route, preventing secondary interfaces (e.g. an ethernet adapter with no
  // internet gateway) from being advertised, which causes asymmetric STUN
  // replies and drops calls to OnHold.
  if (config.network.webRTCIPHandlingPolicy) {
    console.info(`[WebRTC] IP handling policy applied`);
    window.webContents.setWebRTCIPHandlingPolicy(config.network.webRTCIPHandlingPolicy);
  }

  bindDisplayMediaHandler(window.webContents.session);

  // #2534: the Teams-side script pumps VideoFrames from the active
  // screen-share track through a MessagePort; the preview window reconstructs
  // the stream on the other end via MediaStreamTrackGenerator. This avoids a
  // second getUserMedia/portal call (which on Wayland needs a PipeWire token
  // we cannot reuse) and means one capture feeds both Teams and the preview.
  // The 'screen-sharing-started' / 'screen-sharing-stopped' channels are a
  // broadcast: ScreenSharingService updates internal state, MQTTMediaStatusService
  // publishes to the broker, and this listener wires the MessagePort. Adding
  // another ipcMain.on here is the established pattern, not a duplication.

  // Opens the screen-share preview window (if enabled) and connects the
  // Teams renderer to it with a direct MessagePort so a single capture
  // feeds both windows (#2534). One of several listeners on this broadcast
  // channel; see the rationale above.
  ipcMain.on("screen-sharing-started", () => {
    if (!window || window.isDestroyed()) return;
    createScreenSharePreviewWindow();
    const previewWindow = screenSharingService.getPreviewWindow();
    if (!previewWindow || previewWindow.isDestroyed()) {
      console.debug("[SCREEN_SHARE_DIAG] No preview window after creation (thumbnail disabled or already destroyed) - skipping port wiring");
      return;
    }
    const postPorts = () => {
      try {
        const { port1, port2 } = new MessageChannelMain();
        window.webContents.postMessage("screen-share-port", null, [port1]);
        previewWindow.webContents.postMessage("screen-share-port", null, [port2]);
        console.debug("[SCREEN_SHARE_DIAG] Posted MessagePort to Teams renderer and preview window");
      } catch (error) {
        console.error("[SCREEN_SHARE_DIAG] Failed to post MessagePort", {
          error: error.message,
        });
      }
    };
    if (previewWindow.webContents.isLoading()) {
      previewWindow.webContents.once("did-finish-load", postPorts);
    } else {
      postPorts();
    }
  });

  connectionManager = new ConnectionManager();

  if (iconChooser) {
    menus = new Menus(window, configGroup, iconChooser.getFile(), connectionManager, profilesManagerRef);
    menus.onSpellCheckerLanguageChanged = onSpellCheckerLanguageChanged;
  }

  addEventHandlers();

  // Clean expired auth cookies before loading Teams to prevent the
  // "We need you to sign in again" stale banner (#2296)
  await cleanExpiredAuthCookies(window.webContents.session);

  // Restore the last persisted auth-failure signal so login-popup
  // correlation survives app restarts (the broken session does).
  lastAuthFailureSignalAt = Number(appConfig.settingsStore.get(AUTH_SIGNAL_STORE_KEY)) || 0;

  // Monitor renderer auth-failure signals. When Teams can't refresh tokens
  // silently (e.g., after overnight idle), it logs InteractionRequired. We
  // detect this, clear stale auth state, and reload to force a clean
  // interactive login. Detection itself lives in maybeScheduleAuthRecovery
  // so the forwarded window-error path can reuse it.
  app.on('teams-call-connected', () => {
    callActive = true;
    resetMidCallAuthState();
  });
  app.on('teams-call-disconnected', () => {
    callActive = false;
    resetMidCallAuthState();
    if (recoveryQueuedForCallEnd) {
      recoveryQueuedForCallEnd = false;
      console.info('[AUTH_RECOVERY] Call ended, running queued recovery');
      // Short delay so the call teardown finishes before the reload
      setTimeout(
        () =>
          triggerAuthRecovery().catch((err) => {
            console.error('[AUTH_RECOVERY] Failed to trigger auth recovery:', err);
          }),
        5000
      );
    }
  });
  // Page reload (including renderer crash recovery) resets renderer-side call state,
  // so clear the flag to avoid getting stuck if 'teams-call-disconnected' was missed.
  // A reload also moots any queued recovery: if the session is still broken,
  // fresh signals will re-trigger detection.
  window.webContents.on('did-navigate', () => {
    callActive = false;
    resetMidCallAuthState();
    recoveryQueuedForCallEnd = false;
  });
  window.webContents.on('console-message', (event) => {
    maybeScheduleAuthRecovery(event.message, event.sourceId);
  });

  login.handleLoginDialogTry(window, config.ssoBasicAuthUser, config.ssoBasicAuthPasswordCommand);

  const url = processArgs(process.argv);
  connectionManager.start(url, {
    window: window,
    config: config,
  });

  applyAppConfiguration(config, window);
};

function onSpellCheckerLanguageChanged(languages) {
  appConfig.legacyConfigStore.set("spellCheckerLanguages", languages);
}

let allowFurtherRequests = true;

// Feed forwarded renderer window errors into auth-failure detection. Worker
// uncaught errors (e.g. "Uncaught Error: UPR:") arrive via the window-error
// IPC channel rather than console-message, so app/index.js calls this from
// that handler. `filename` is the originating script URL.
exports.notifyRendererError = function (message, filename) {
  maybeScheduleAuthRecovery(message, filename);
};

exports.show = function () {
  window.show();
};

// Restore if minimised, show if hidden to tray, then focus. Used by the
// notification click handler when notifications.electron.clickAction is
// "restore" (issue #2647).
exports.restoreWindow = restoreWindow;

exports.getWindow = function () {
  return window;
};

exports.bindDisplayMediaHandler = bindDisplayMediaHandler;

exports.setQuickChatManager = function (quickChatManager) {
  if (menus) {
    menus.setQuickChatManager(quickChatManager);
  }
};

exports.onAppSecondInstance = function onAppSecondInstance(event, args) {
  console.debug("second-instance started");
  if (window) {
    event.preventDefault();
    const url = processArgs(args);
    if (url && allowFurtherRequests) {
      allowFurtherRequests = false;
      setTimeout(() => {
        allowFurtherRequests = true;
      }, 5000);
      window.loadURL(url, { userAgent: config.chromeUserAgent });
    }

    restoreWindow();
  }
};

function applyAppConfiguration(config, window) {
  applySpellCheckerConfiguration(config.spellCheckerLanguages, window);

  const certPath = config.clientCertPath;
  if (certPath) {
    app.importCertificate(
      {
        certificate: certPath,
        password: config.clientCertPassword || "",
      },
      (result) => {
        console.info(
          `[CERT] Client certificate loaded, result: ${result}`
        );
      }
    );
  }
  window.webContents.setUserAgent(config.chromeUserAgent);

  if (!config.minimized) {
    window.show();
  } else {
    window.hide();
  }

  if (config.webDebug) {
    window.openDevTools();
  }
}

function applySpellCheckerConfiguration(languages, window) {
  const spellCheckProvider = new SpellCheckProvider(window);
  if (
    spellCheckProvider.setLanguages(languages).length === 0 &&
    languages.length > 0
  ) {
    // If failed to set user supplied languages, fallback to system locale.
    const systemList = [app.getLocale()];
    if (app.getLocale() !== app.getSystemLocale()) {
      systemList.push(app.getSystemLocale());
    }
    spellCheckProvider.setLanguages(systemList);
  }
}

function onDidFinishLoad() {
  console.debug("did-finish-load");

  // Skip script injection on Chrome error pages (e.g. chrome-error://chromewebdata/)
  // which appear when navigation fails due to network errors like ERR_NAME_NOT_RESOLVED.
  // Injecting scripts into these pages causes crashes because APIs like
  // navigator.mediaDevices are unavailable.
  const currentUrl = window.webContents.getURL();
  if (!currentUrl.startsWith("https://")) {
    console.debug(`[CONNECTION] Skipping script injection on non-Teams page: ${currentUrl.split("?")[0]}`);
    return;
  }

  window.webContents.executeJavaScript(`
			openBrowserButton = document.querySelector('[data-tid=joinOnWeb]');
			openBrowserButton && openBrowserButton.click();
		`).catch(() => {});
  window.webContents.executeJavaScript(`
			tryAgainLink = document.getElementById('try-again-link');
			tryAgainLink && tryAgainLink.click()
		`).catch(() => {});

  injectScreenSharingLogic();

  customCSS.onDidFinishLoad(window.webContents, config);
  initSystemThemeFollow(config);
}

function injectScreenSharingLogic() {
  const fs = require("node:fs");
  const scriptPath = path.join(
    __dirname,
    "..",
    "screenSharing",
    "injectedScreenSharing.js"
  );
  try {
    const script = fs.readFileSync(scriptPath, "utf8");
    window.webContents.executeJavaScript(script).catch((err) => {
      console.error("[SCREEN_SHARE] Failed to execute injected script:", err.message);
    });
  } catch (err) {
    console.error("Failed to load injected screen sharing script:", err);
  }
}

function initSystemThemeFollow(config) {
  if (config.followSystemTheme) {
    nativeTheme.on("updated", () => {
      window.webContents.send(
        "system-theme-changed",
        nativeTheme.shouldUseDarkColors
      );
    });
    setTimeout(() => {
      window.webContents.send(
        "system-theme-changed",
        nativeTheme.shouldUseDarkColors
      );
    }, 2500);
  }
}

function onDidFrameFinishLoad(
  event,
  isMainFrame,
  frameProcessId,
  frameRoutingId
) {
  console.debug("did-frame-finish-load", event, isMainFrame);

  if (isMainFrame) {
    return; // We want to insert CSS only into the Teams V2 content iframe
  }

  const wf = webFrameMain.fromId(frameProcessId, frameRoutingId);
  customCSS.onDidFrameFinishLoad(wf, config);
}

function restoreWindow() {
  if (window.isMinimized()) {
    window.restore();
  } else if (!window.isVisible()) {
    window.show();
  }

  window.focus();
}

/**
 * Processes command line arguments to extract Teams URLs and protocol handlers.
 * Handles both msteams:// protocol links and HTTPS URLs that match the Teams domain pattern.
 * This enables deep linking into Teams conversations, meetings, and channels.
 *
 * @param {string[]} args - Command line arguments to process
 * @returns {string|null} Processed URL to navigate to, or null if no valid URL found
 */
function processArgs(args) {
  // Legacy Teams protocol format: msteams:/l/meetup-join/...
  const v1msTeams = new RegExp(config.msTeamsProtocols.v1);
  // Modern Teams protocol format: msteams://teams.microsoft.com/l/...
  const v2msTeams = new RegExp(config.msTeamsProtocols.v2);
  console.debug("processArgs:", args);
  for (const arg of args) {
    console.debug(
      `testing RegExp processArgs ${new RegExp(config.meetupJoinRegEx).test(
        arg
      )}`
    );
    if (new RegExp(config.meetupJoinRegEx).test(arg)) {
      console.debug("A url argument received with https protocol");
      window.show();
      return arg;
    }
    if (v1msTeams.test(arg)) {
      console.debug("A url argument received with msteams v1 protocol");
      window.show();
      return config.url + arg.substring(8, arg.length);
    }
    if (v2msTeams.test(arg)) {
      console.debug("A url argument received with msteams v2 protocol");
      window.show();
      return arg.replace("msteams", "https");
    }
  }
}

// Microsoft telemetry / beacon hosts that are not required for Teams to
// function. Blocking these at webRequest cancels both the network traffic
// and the downstream sub-frame failure logs they would otherwise produce
// in restricted-network environments. Kept deliberately narrow: anything
// Teams needs to function (teams.cloud.microsoft, *.office.net,
// login.microsoftonline.com, *.trafficmanager.net) is excluded. Start
// with this initial set and expand as new hosts are confirmed safe to
// drop; any new entry must also satisfy `MS_TELEMETRY_FAST_PATH` below
// or the fast-path string must be updated.
const MS_TELEMETRY_HOSTS = [
  'events.data.microsoft.com',
  'browser.events.data.msn.com',
];

// Substring guard cheap-checked before the URL parse below. Every entry
// in `MS_TELEMETRY_HOSTS` must contain this substring so the fast path
// never produces a false negative.
const MS_TELEMETRY_FAST_PATH = 'events.data.';

function isMicrosoftTelemetryHost(url) {
  // Fast path: avoid `new URL(...)` on every HTTPS request. The handler
  // fires for every request matched by `{ urls: ["https://*/*"] }`, so
  // skipping the parse for the overwhelmingly common non-telemetry case
  // is measurable on chat-heavy sessions.
  if (!url || !url.includes(MS_TELEMETRY_FAST_PATH)) return false;
  try {
    const hostname = new URL(url).hostname;
    return MS_TELEMETRY_HOSTS.some(
      (h) => hostname === h || hostname.endsWith('.' + h)
    );
  } catch {
    return false;
  }
}

function onBeforeRequestHandler(details, callback) {
  if (isMicrosoftTelemetryHost(details.url)) {
    callback({ cancel: true });
    return;
  }

  const customBackgroundRedirect =
    customBackgroundService.beforeRequestHandlerRedirectUrl(details);

  if (customBackgroundRedirect) {
    callback(customBackgroundRedirect);
  } else if (aboutBlankRequestCount < 1) {
    callback({});
  } else if (details.resourceType === "mainFrame") {
    // A top-level navigation is never the about:blank popup's own request, so
    // it must not be diverted into the hidden child window below. Diverting it
    // cancels the navigation (ERR_BLOCKED_BY_CLIENT) and leaves a blank page,
    // e.g. the guest / number-matching MFA sign-in where the main frame
    // navigates to the authorize URL right after an about:blank popup bumped
    // the counter (#2591). A new top-level navigation also makes any pending
    // interceptions stale, so reset the counter to 0 rather than decrementing
    // it: that way a leftover count cannot divert the new page's sub-resources.
    aboutBlankRequestCount = 0;
    callback({});
  } else if (isAuthLoginUrl(details.url) && shouldInterceptAuthPopup()) {
    // The hidden-window handling below exists for SILENT token refresh. An
    // interactive login can never complete in a window that is hidden and
    // destroyed on ready-to-show — which is why clicking the stale "sign in
    // again" banner appears to do nothing: the click opens an about:blank
    // popup whose login navigation lands here and dies invisibly (it never
    // reaches the isAuthLoginUrl check in onNewWindow, because the URL is
    // still about:blank at window-open time). When the navigation correlates
    // with a broken session (see shouldInterceptAuthPopup), run in-app
    // recovery instead. Reset the counter: recovery reloads the page, so any
    // pending interceptions are stale (#2591 rationale).
    aboutBlankRequestCount = 0;
    triggerPopupRecovery('Login navigation from about:blank popup intercepted');
    callback({ cancel: true });
  } else {
    // Open request in hidden child window for authentication
    const child = new BrowserWindow({ parent: window, show: false });
    child.loadURL(details.url);
    child.once("ready-to-show", () => {
      child.destroy();
    });

    aboutBlankRequestCount -= 1;
    callback({ cancel: true });
  }
}

// Teams domains whose enforcing CSP we never touch
const TEAMS_DOMAINS = [
  'teams.cloud.microsoft',
  'teams.microsoft.com',
  'teams.live.com',
  'statics.teams.cdn.office.net',
];

/**
 * Checks whether a URL belongs to a Teams domain.
 * Also handles Microsoft Cloud App Security (MCAS) proxy suffix.
 */
function isTeamsDomain(url) {
  try {
    const hostname = stripMcasSuffix(new URL(url).hostname);
    return TEAMS_DOMAINS.some(d => hostname === d || hostname.endsWith('.' + d));
  } catch {
    return false;
  }
}

// Microsoft Identity Platform login hostnames. When Teams opens a popup to
// one of these it is requesting interactive re-authentication (e.g. the
// "sign in again" banner). Kept separate from AUTH_DOMAINS because that
// list includes broad domains used for cookie scoping; this narrower set
// is only the endpoints that initiate an OAuth/OIDC interactive flow.
const AUTH_LOGIN_DOMAINS = [
  'login.microsoftonline.com',
  'login.microsoft.com',
  'login.live.com',
];

/**
 * Returns true when the URL targets a Microsoft Identity Platform login page.
 * Used to intercept re-auth popups that Teams opens from the "sign in again"
 * banner so they complete inside the Electron app instead of opening an
 * external browser window that Electron cannot observe.
 */
function isAuthLoginUrl(url) {
  try {
    const hostname = stripMcasSuffix(new URL(url).hostname);
    return AUTH_LOGIN_DOMAINS.some(d => hostname === d || hostname.endsWith('.' + d));
  } catch {
    return false;
  }
}

/**
 * Strips report-only CSP headers for non-Teams domains (#2326).
 *
 * With contextIsolation disabled the shared V8 context erroneously
 * enforces report-only policies as blocking, breaking SSO flows
 * that rely on dynamic code or nonce-less scripts (e.g. Symantec VIP).
 * Report-only headers are safe to strip since they should never block.
 */
function stripCspForAuthPages(responseHeaders, url) {
  if (isTeamsDomain(url)) return;

  for (const key of Object.keys(responseHeaders)) {
    if (key.toLowerCase() === 'content-security-policy-report-only') {
      let hostname;
      try {
        hostname = new URL(url).hostname;
      } catch {
        hostname = 'unknown';
      }
      console.debug(`[CSP] Stripping report-only header from: ${hostname}`);
      delete responseHeaders[key];
    }
  }
}

function onHeadersReceivedHandler(details, callback) {
  customBackgroundService.onHeadersReceivedHandler(details);

  stripCspForAuthPages(details.responseHeaders, details.url);

  callback({
    responseHeaders: details.responseHeaders,
  });
}

function onBeforeSendHeadersHandler(detail, callback) {
  if (intune?.isSsoUrl(detail.url)) {
    intune.addSsoCookie(detail, callback);
  } else {
    customBackgroundService.addCustomBackgroundHeaders(detail, callback);

    callback({
      requestHeaders: detail.requestHeaders,
    });
  }
}

function onNewWindow(details) {
  // Breadcrumb for diagnosing which shape of popup the "sign in again"
  // banner opens (about:blank-then-navigate vs a direct login URL) — the two
  // take different paths below and only the direct form can be intercepted
  // for recovery. Auth-related popups only, origin only: no path, query, or
  // user-specific data is logged.
  if (details.url.startsWith("about:blank") || isAuthLoginUrl(details.url)) {
    let origin = "about:blank";
    if (!details.url.startsWith("about:blank")) {
      try {
        origin = new URL(details.url).origin;
      } catch {
        origin = "unparseable";
      }
    }
    console.info('[WINDOW_OPEN] Auth-related popup', { origin });
  }

  if (new RegExp(config.meetupJoinRegEx).test(details.url)) {
    if (config.onNewWindowOpenMeetupJoinUrlInApp) {
      window.loadURL(details.url, { userAgent: config.chromeUserAgent });
    }
    return { action: "deny" };
  } else if (
    details.url === "about:blank" ||
    details.url === "about:blank#blocked"
  ) {
    aboutBlankRequestCount += 1;
    return { action: "deny" };
  } else if (isAuthLoginUrl(details.url) && shouldInterceptAuthPopup()) {
    // Teams is opening a direct-URL Microsoft login popup from a session
    // that recently emitted auth-failure signals (see
    // shouldInterceptAuthPopup). Opening login.microsoftonline.com in an
    // external browser completes auth there but Electron never receives the
    // result, so trigger in-app recovery instead: clear stale auth state and
    // reload Teams for a fresh interactive sign-in within the app. (The
    // stale-banner popup is usually about:blank-shaped and is handled in
    // onBeforeRequestHandler; this branch covers the direct-URL form.)
    // Login popups without a correlated failure signal (initial sign-in,
    // consent and step-up prompts, adding an account) keep the original
    // open-externally behaviour via secureOpenLink below.
    triggerPopupRecovery('Direct login popup intercepted');
    return { action: "deny" };
  }

  return secureOpenLink(details);
}

function onPageTitleUpdated(_event, title) {
  window.webContents.send("page-title", title);
}

function onNavigationChanged() {
  if (window?.webContents?.navigationHistory) {
    const canGoBack = window.webContents.navigationHistory.canGoBack();
    const canGoForward = window.webContents.navigationHistory.canGoForward();
    window.webContents.send("navigation-state-changed", canGoBack, canGoForward);
  }
}

function onWindowClosed() {
  console.debug("window closed");

  // Close preview window before quitting to prevent race conditions
  const previewWindow = screenSharingService?.getPreviewWindow();
  if (previewWindow && !previewWindow.isDestroyed()) {
    console.debug("[SCREEN_SHARE_DIAG] Closing preview window before app quit");
    previewWindow.close();
    screenSharingService.setPreviewWindow(null);
    screenSharingService.setSelectedSource(null);
  }

  window = null;
  app.quit();
}

function addEventHandlers() {
  customBackgroundService.initializeCustomBGServiceURL();

  // After resuming from sleep, check if auth cookies expired during suspend.
  // Electron on Linux lacks OS-level auth brokers (WAM/Keychain) that browsers
  // use to transparently refresh tokens, so we handle expiry ourselves.
  const { powerMonitor } = require("electron");
  powerMonitor.on("resume", async () => {
    console.debug('[AUTH_RECOVERY] System resumed, checking auth cookies');
    const result = await cleanExpiredAuthCookies(window.webContents.session);
    if (result.expired > 0) {
      console.info('[AUTH_RECOVERY] Cleaned expired cookies after resume', {
        cleaned: result.cleaned,
        expired: result.expired,
      });
      // Let Teams' own MSAL retry handle re-authentication rather than
      // triggering full recovery which clears all auth state (issue #2364)
    }
  });

  window.on("page-title-updated", onPageTitleUpdated);
  window.webContents.setWindowOpenHandler(onNewWindow);
  window.webContents.session.webRequest.onBeforeRequest(
    { urls: ["https://*/*"] },
    onBeforeRequestHandler
  );
  window.webContents.session.webRequest.onHeadersReceived(
    { urls: ["https://*/*"] },
    onHeadersReceivedHandler
  );
  window.webContents.session.webRequest.onBeforeSendHeaders(
    getWebRequestFilterFromURL(),
    onBeforeSendHeadersHandler
  );
  window.webContents.on("did-finish-load", onDidFinishLoad);
  window.webContents.on("did-frame-finish-load", onDidFrameFinishLoad);
  window.on("closed", onWindowClosed);
  window.webContents.addListener("before-input-event", onBeforeInput);

  // Navigation state change handlers
  window.webContents.on("did-navigate", onNavigationChanged);
  window.webContents.on("did-navigate-in-page", onNavigationChanged);
}

function getWebRequestFilterFromURL() {
  const filter = customBackgroundService.isCustomBackgroundHttpProtocol()
    ? { urls: ["http://*/*"] }
    : { urls: ["https://*/*"] };
  if (intune) {
    intune.setupUrlFilter(filter);
  }

  return filter;
}

function onBeforeInput(event, input) {
  isControlPressed = input.control;

  if (input.type !== "keyDown") {
    return;
  }
  const history = window?.webContents?.navigationHistory;
  if (!history) {
    return;
  }

  // Keyboard history navigation, independent of the Teams DOM. The injected
  // on-screen back/forward controls (navigationButtons.js) break whenever
  // Microsoft restructures the top bar (#2671); these accelerators are the
  // layout-independent fallback. Keys are platform-specific: on macOS,
  // Option(Alt)+Left/Right is the system word-navigation shortcut inside text
  // fields, so stealing it would break message editing — macOS uses the
  // standard Cmd+[ / Cmd+] instead, while other platforms use the
  // browser-standard Alt+Left / Alt+Right.
  const isMac = process.platform === "darwin";
  const modifierActive = isMac
    ? input.meta && !input.control && !input.alt && !input.shift
    : input.alt && !input.control && !input.meta && !input.shift;
  if (!modifierActive) {
    return;
  }

  const backKey = isMac ? "[" : "ArrowLeft";
  const forwardKey = isMac ? "]" : "ArrowRight";
  if (input.key === backKey && history.canGoBack()) {
    event.preventDefault();
    history.goBack();
  } else if (input.key === forwardKey && history.canGoForward()) {
    event.preventDefault();
    history.goForward();
  }
}

function secureOpenLink(details) {
  console.debug('[LINK] Requesting to open external link');
  const action = getLinkAction();

  if (action === 0) {
    openInBrowser(details);
  }

  const returnValue =
    action === 1
      ? {
          action: "allow",
          overrideBrowserWindowOptions: {
            modal: true,
            useContentSize: true,
            parent: window,
          },
        }
      : { action: "deny" };

  if (action === 1) {
    removePopupWindowMenu();
  }

  return returnValue;
}

function openInBrowser(details) {
  if (config.defaultURLHandler.trim() === "") {
    shell.openExternal(details.url);
  } else {
    execFile(
      config.defaultURLHandler.trim(),
      [details.url],
      openInBrowserErrorHandler
    );
  }
}

function openInBrowserErrorHandler(error) {
  if (error) {
    console.error(`openInBrowserErrorHandler ${error.message}`);
  }
}

function getLinkAction() {
  const action = isControlPressed
    ? dialog.showMessageBoxSync(window, {
        type: "warning",
        buttons: ["Allow", "Deny"],
        title: "Open URL",
        normalizeAccessKeys: true,
        defaultId: 1,
        cancelId: 1,
        message:
          "This will open the URL in the application context. If this is for SSO, click Allow otherwise Deny.",
      }) + 1
    : 0;

  isControlPressed = false;
  return action;
}

async function removePopupWindowMenu() {
  for (let i = 1; i <= 200; i++) {
    await sleep(10);
    const childWindows = window.getChildWindows();
    if (childWindows.length) {
      childWindows[0].removeMenu();
      break;
    }
  }
}

async function sleep(ms) {
  return await new Promise((r) => setTimeout(r, ms));
}
