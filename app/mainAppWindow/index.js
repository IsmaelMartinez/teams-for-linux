const {
  shell,
  BrowserWindow,
  app,
  nativeTheme,
  dialog,
  webFrameMain,
  nativeImage,
  desktopCapturer,
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
const outlookNotificationModule = require("../notification");
const os = require("node:os");
const path = require("node:path");

// Default configuration for the screen sharing thumbnail preview (avoid magic values)
const DEFAULT_SCREEN_SHARING_THUMBNAIL_CONFIG = {
  enabled: true,
  alwaysOnTop: true,
};

let iconChooser;
let intune;
let isControlPressed = false;
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
  // Store the source ID in the screen sharing service
  screenSharingService.setSelectedSource(selectedSource);

  // Create preview window for screen sharing
  createScreenSharePreviewWindow();
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
        sourceId: source?.id,
      });
      setImmediate(() => {
        try {
          callback({});
        } catch {
          console.debug(
            "[SCREEN_SHARE] Failed to complete screen selection callback",
          );
        }
      });
    });
}

function createScreenSharePreviewWindow() {
  const startTime = Date.now();

  // Get configuration - use the module-level config variable
  // Support both new (screenSharing.thumbnail) and legacy (screenSharingThumbnail) config paths
  let thumbnailConfig =
    config?.screenSharing?.thumbnail ??
    config?.screenSharingThumbnail ??
    DEFAULT_SCREEN_SHARING_THUMBNAIL_CONFIG;

  const previewWindow = screenSharingService.getPreviewWindow();
  const activeSource = screenSharingService.getSelectedSource();

  console.debug("[SCREEN_SHARE_DIAG] Preview window creation requested", {
    enabled: thumbnailConfig.enabled,
    alwaysOnTop: thumbnailConfig.alwaysOnTop || false,
    existingWindow: previewWindow && !previewWindow.isDestroyed(),
    activeSource: activeSource,
    timestamp: new Date().toISOString(),
  });

  if (!thumbnailConfig.enabled) {
    console.debug(
      "[SCREEN_SHARE_DIAG] Preview window disabled in configuration",
    );
    return;
  }

  // Don't create duplicate windows - this is critical for preventing echo
  if (previewWindow && !previewWindow.isDestroyed()) {
    console.warn(
      "[SCREEN_SHARE_DIAG] Preview window already exists, focusing existing",
      {
        riskLevel: "MEDIUM - multiple preview windows could cause audio issues",
        action: "focusing existing window instead of creating new",
        windowId: previewWindow.id,
      },
    );
    previewWindow.focus();
    return;
  }

  console.debug("[SCREEN_SHARE_DIAG] Creating new preview window", {
    dimensions: "320x180",
    alwaysOnTop: thumbnailConfig.alwaysOnTop || false,
    partition: "persist:outlook-for-linux-session",
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
        "previewWindowPreload.js",
      ),
      partition: "persist:outlook-for-linux-session",
    },
  });

  // Store in service
  screenSharingService.setPreviewWindow(newPreviewWindow);

  const windowId = newPreviewWindow.id;
  console.debug("[SCREEN_SHARE_DIAG] Preview BrowserWindow created", {
    windowId: windowId,
    creationTimeMs: Date.now() - startTime,
    alwaysOnTop: thumbnailConfig.alwaysOnTop || false,
  });

  newPreviewWindow.loadFile(
    path.join(__dirname, "..", "screenSharing", "previewWindow.html"),
  );

  newPreviewWindow.once("ready-to-show", () => {
    console.debug("[SCREEN_SHARE_DIAG] Preview window ready, showing now", {
      windowId: windowId,
      totalCreationTimeMs: Date.now() - startTime,
      focused: newPreviewWindow.isFocused(),
      visible: newPreviewWindow.isVisible(),
    });
    newPreviewWindow.show();
  });

  // Add focus/blur event handlers to detect when preview window gets focus
  newPreviewWindow.on("focus", () => {
    console.debug("[SCREEN_SHARE_DIAG] Preview window gained focus", {
      windowId: windowId,
      potentialIssue: "Focus on preview might interfere with main Teams window",
    });
  });

  newPreviewWindow.on("blur", () => {
    console.debug("[SCREEN_SHARE_DIAG] Preview window lost focus", {
      windowId: windowId,
    });
  });

  newPreviewWindow.on("closed", () => {
    const closedSource = screenSharingService.getSelectedSource();
    console.debug("[SCREEN_SHARE_DIAG] Preview window closed", {
      windowId: windowId,
      hadActiveSource: !!closedSource,
      closedSource: closedSource,
    });
    // Clear both preview window and selected source when window closes
    screenSharingService.setPreviewWindow(null);
    screenSharingService.setSelectedSource(null);
  });
}

// Microsoft auth domains whose cookies should be checked/cleaned
const AUTH_DOMAINS = [
  "login.microsoftonline.com",
  "login.microsoft.com",
  "outlook.office.com",
  "outlook.office365.com",
  "outlook.live.com",
  "microsoft.com",
  "office.com",
  "office365.com",
  "live.com",
  "microsoftonline.com",
];

// Azure AD / MSAL / SharePoint auth cookie names
const AUTH_COOKIE_NAMES = new Set([
  "ESTSAUTH",
  "ESTSAUTHPERSISTENT",
  "ESTSAUTHLIGHT",
  "SignInStateCookie",
  "AADSSO",
  "buid",
  "fpc",
  "x-ms-gateway-slice",
  "stsservicecookie",
  "CCState",
  "FedAuth",
  "rtFa",
]);

// Auth cookies preserved during force-clean recovery so the Microsoft
// account chooser stays prefilled after session expiry (issue #2364).
const PRESERVE_ON_RECOVERY = new Set(['ESTSAUTHPERSISTENT']);

// localStorage key patterns for MSAL/Teams auth tokens
const AUTH_LOCAL_STORAGE_PATTERNS = [
  "tmp.auth.v1.",
  "refresh_token",
  "msal.token",
  "msal.",
  "EncryptionKey",
  "authSessionId",
  "LogoutState",
  "accessToken",
  "idtoken",
  "Account",
  "Authority",
  "ClientInfo",
  "secure_outlook_",
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

    const authCookies = allCookies.filter((cookie) => {
      const domain = (cookie.domain || "").replace(/^\./, "");
      const isAuthDomain = AUTH_DOMAINS.some(
        (d) => domain === d || domain.endsWith("." + d),
      );
      return isAuthDomain && AUTH_COOKIE_NAMES.has(cookie.name);
    });

    const expired = authCookies.filter(
      (c) => c.expirationDate && c.expirationDate < nowSeconds,
    );
    const cookiesToRemove = forceCleanAll ? authCookies : expired;

    if (cookiesToRemove.length === 0) {
      console.debug("[AUTH_RECOVERY] Cookie check:", {
        total: authCookies.length,
        expired: expired.length,
      });
      return { cleaned: 0, total: authCookies.length, expired: expired.length };
    }

    console.info("[AUTH_RECOVERY] Cleaning auth cookies:", {
      mode: forceCleanAll ? "force-all" : "expired-only",
      removing: cookiesToRemove.length,
      total: authCookies.length,
    });

    const results = await Promise.all(
      cookiesToRemove.map(async (cookie) => {
        try {
          const protocol = cookie.secure ? "https" : "http";
          const domain = cookie.domain.startsWith(".")
            ? cookie.domain.substring(1)
            : cookie.domain;
          const url = `${protocol}://${domain}${cookie.path || "/"}`;
          await windowSession.cookies.remove(url, cookie.name);
          return true;
        } catch (err) {
          console.warn("[AUTH_RECOVERY] Failed to remove cookie:", {
            name: cookie.name,
            error: err.message,
          });
          return false;
        }
      }),
    );
    const removedCount = results.filter(Boolean).length;

    console.info(
      `[AUTH_RECOVERY] Cleaned ${removedCount}/${cookiesToRemove.length} auth cookies`,
    );
    return {
      cleaned: removedCount,
      total: authCookies.length,
      expired: expired.length,
    };
  } catch (error) {
    console.error("[AUTH_RECOVERY] Cookie check failed:", error.message);
    return { cleaned: 0, total: 0, expired: 0 };
  }
}

/**
 * Clears stale auth state (localStorage tokens + cookies) and reloads
 * the page to force a fresh interactive login.
 */
async function triggerAuthRecovery() {
  console.info("[AUTH_RECOVERY] Clearing auth state and reloading...");

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
    console.info("[AUTH_RECOVERY] Cleared localStorage auth entries", {
      count: cleared,
    });
  } catch (err) {
    console.warn("[AUTH_RECOVERY] Failed to clear localStorage:", err.message);
  }

  await cleanExpiredAuthCookies(window.webContents.session, true);

  console.info("[AUTH_RECOVERY] Reloading for fresh auth...");
  window.loadURL(config.url, { userAgent: config.chromeUserAgent });
}

exports.onAppReady = async function onAppReady(
  configGroup,
  customBackground,
  sharingService,
) {
  appConfig = configGroup;
  config = configGroup.startupConfig;
  customBackgroundService = customBackground;
  screenSharingService = sharingService;

  // Support both new (auth.intune.*) and deprecated (ssoInTune*) config options
  const intuneEnabled = config.auth?.intune?.enabled || config.ssoInTuneEnabled;
  const intuneUser =
    config.auth?.intune?.user ?? config.ssoInTuneAuthUser ?? "";
  if (intuneEnabled) {
    intune = require("../intune");
    await intune.initSso(intuneUser);
  }

  if (config.trayIconEnabled) {
    iconChooser = new TrayIconChooser(config);

    if (isMac) {
      console.info("Setting Dock icon for macOS");
      let dockIconPath;

      // Use custom icon if specified, otherwise use default 256x256 icon for dock
      if (config.appIcon && config.appIcon.trim() !== "") {
        dockIconPath = config.appIcon;
      } else {
        dockIconPath = path.join(config.appPath, "assets/icons/icon-96x96.png");
      }

      const icon = nativeImage.createFromPath(dockIconPath);
      const iconSize = icon.getSize();

      if (iconSize.width < 128) {
        console.warn(
          `Unable to set dock icon for macOS, icon size is less than 128x128, current size ${iconSize.width}x${iconSize.height}. Using resized icon.`,
        );
        // Resize the icon to meet macOS dock requirements
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
    window.webContents.setWebRTCIPHandlingPolicy(
      config.network.webRTCIPHandlingPolicy,
    );
  }

  window.webContents.session.setDisplayMediaRequestHandler(
    (_request, callback) => {
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
    },
  );

  // Initialize connection manager
  connectionManager = new ConnectionManager();

  if (iconChooser) {
    menus = new Menus(
      window,
      configGroup,
      iconChooser.getFile(),
      connectionManager,
    );
    menus.onSpellCheckerLanguageChanged = onSpellCheckerLanguageChanged;

    // Initialize Outlook notification module with window, icon, and menus (for badge updates)
    outlookNotificationModule.init(window, iconChooser.getFile(), menus);
  }

  addEventHandlers();

  // Clean expired auth cookies before loading Teams to prevent the
  // "We need you to sign in again" stale banner (#2296)
  await cleanExpiredAuthCookies(window.webContents.session);

  // Monitor renderer console for MSAL silent auth failures.
  // When Outlook can't refresh tokens silently (e.g., after overnight idle),
  // it logs InteractionRequired. We detect this, clear stale auth state,
  // and reload to force a clean interactive login.
  const AUTH_FAILURE_PATTERNS = ["InteractionRequired", "AuthFailed"];
  // Only trust auth failure signals from Outlook/Microsoft origins
  const TRUSTED_AUTH_SOURCES = [
    "outlook.office.com",
    "outlook.office365.com",
    "outlook.live.com",
    "login.microsoftonline.com",
  ];
  let authRecoveryTriggered = false;
  window.webContents.on("console-message", (event) => {
    if (authRecoveryTriggered) return;
    const message = event.message || "";
    if (!AUTH_FAILURE_PATTERNS.some((p) => message.includes(p))) return;

    // Verify the message originates from a trusted Microsoft source
    const sourceId = event.sourceId || "";
    if (sourceId && !TRUSTED_AUTH_SOURCES.some((s) => sourceId.includes(s)))
      return;

    authRecoveryTriggered = true;
    console.info("[AUTH_RECOVERY] Auth failure detected, scheduling recovery");

    // Delay to let Teams' own retry mechanism attempt recovery first
    setTimeout(() => triggerAuthRecovery(), 5000);
  });

  login.handleLoginDialogTry(
    window,
    config.ssoBasicAuthUser,
    config.ssoBasicAuthPasswordCommand,
  );

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

exports.show = function () {
  window.show();
};

exports.getWindow = function () {
  return window;
};

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
        console.info(`[CERT] Client certificate loaded, result: ${result}`);
      },
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
    console.debug(
      `[CONNECTION] Skipping script injection on non-Teams page: ${currentUrl.split("?")[0]}`,
    );
    return;
  }

  window.webContents
    .executeJavaScript(
      `
			openBrowserButton = document.querySelector('[data-tid=joinOnWeb]');
			openBrowserButton && openBrowserButton.click();
		`,
    )
    .catch(() => {});
  window.webContents
    .executeJavaScript(
      `
			tryAgainLink = document.getElementById('try-again-link');
			tryAgainLink && tryAgainLink.click()
		`,
    )
    .catch(() => {});

  // Inject browser functionality
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
    "injectedScreenSharing.js",
  );
  try {
    const script = fs.readFileSync(scriptPath, "utf8");
    window.webContents.executeJavaScript(script).catch((err) => {
      console.error(
        "[SCREEN_SHARE] Failed to execute injected script:",
        err.message,
      );
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
        nativeTheme.shouldUseDarkColors,
      );
    });
    setTimeout(() => {
      window.webContents.send(
        "system-theme-changed",
        nativeTheme.shouldUseDarkColors,
      );
    }, 2500);
  }
}

function onDidFrameFinishLoad(
  event,
  isMainFrame,
  frameProcessId,
  frameRoutingId,
) {
  console.debug("did-frame-finish-load", event, isMainFrame);

  if (isMainFrame) {
    return; // We want to insert CSS only into the Teams V2 content iframe
  }

  const wf = webFrameMain.fromId(frameProcessId, frameRoutingId);
  customCSS.onDidFrameFinishLoad(wf, config);
}

function restoreWindow() {
  // If minimized, restore.
  if (window.isMinimized()) {
    window.restore();
  }

  // If closed to tray, show.
  else if (!window.isVisible()) {
    window.show();
  }

  window.focus();
}

/**
 * Processes command line arguments to extract Outlook URLs and protocol handlers.
 * Handles both msoutlook:// protocol links and HTTPS URLs that match the Outlook domain pattern.
 * This enables deep linking into Outlook mail, calendar, and contacts.
 *
 * @param {string[]} args - Command line arguments to process
 * @returns {string|null} Processed URL to navigate to, or null if no valid URL found
 */
/**
 * Converts a mailto: URI into an Outlook deep-link compose URL.
 * e.g. mailto:user@example.com?subject=Hello&body=World
 *   → https://outlook.office.com/mail/deeplink/compose?to=...&subject=...&body=...
 */
function convertMailtoToOutlookURL(mailto) {
  try {
    const parsed = new URL(mailto);
    const to = parsed.pathname;
    const subject = parsed.searchParams.get("subject") || "";
    const body = parsed.searchParams.get("body") || "";
    return (
      `https://outlook.office.com/mail/deeplink/compose` +
      `?to=${encodeURIComponent(to)}` +
      `&subject=${encodeURIComponent(subject)}` +
      `&body=${encodeURIComponent(body)}`
    );
  } catch {
    return null;
  }
}

/**
 * Opens a compose window for the given Outlook URL.
 */
function openComposeWindow(url) {
  const composeWindow = new BrowserWindow({
    width: 900,
    height: 700,
    webPreferences: {
      partition: config.partition,
      contextIsolation: false,
      nodeIntegration: false,
      spellcheck: true,
      preload: path.join(__dirname, "..", "browser", "preload-secondary.js"),
    },
    parent: window,
    show: false,
  });
  setupSecondaryWindowHandlers(composeWindow);
  composeWindow.loadURL(url, { userAgent: config.chromeUserAgent });
  composeWindow.once("ready-to-show", () => composeWindow.show());
  return composeWindow;
}

function processArgs(args) {
  // Legacy Outlook protocol format: msoutlook:/mail/...
  const v1msOutlook = new RegExp(config.msOutlookProtocols.v1);
  // Modern Outlook protocol format: msoutlook://outlook.office.com/mail/...
  const v2msOutlook = new RegExp(config.msOutlookProtocols.v2);
  console.debug("processArgs:", args);
  for (const arg of args) {
    console.debug(
      `testing RegExp processArgs ${new RegExp(config.meetupJoinRegEx).test(
        arg,
      )}`,
    );
    if (arg.startsWith("mailto:")) {
      console.debug("A mailto: argument received, opening compose window");
      const composeUrl = convertMailtoToOutlookURL(arg);
      if (composeUrl) {
        openComposeWindow(composeUrl);
      }
      return null;
    }
    if (new RegExp(config.meetupJoinRegEx).test(arg)) {
      console.debug("A url argument received with https protocol");
      window.show();
      return arg;
    }
    if (v1msOutlook.test(arg)) {
      console.debug("A url argument received with msoutlook v1 protocol");
      window.show();
      return config.url + arg.substring(10, arg.length);
    }
    if (v2msOutlook.test(arg)) {
      console.debug("A url argument received with msoutlook v2 protocol");
      window.show();
      return arg.replace("msoutlook", "https");
    }
  }
}

const TELEMETRY_HOSTNAMES = new Set([
  "events.data.microsoft.com",
  "browser.pipe.aria.microsoft.com",
  "vortex.data.microsoft.com",
]);

function isTelemetryUrl(url) {
  try {
    const { hostname, pathname } = new URL(url);
    if (TELEMETRY_HOSTNAMES.has(hostname)) return true;
    if (pathname.startsWith("/api/v2/track") || pathname.startsWith("/collect"))
      return true;
    if (
      hostname.includes("telemetry") ||
      hostname.includes("analytics") ||
      hostname.includes("collector")
    )
      return true;
  } catch {
    // ignore invalid URLs
  }
  return false;
}

function onBeforeRequestHandler(details, callback) {
  // Block telemetry requests to reduce network overhead and CSP noise
  if (isTelemetryUrl(details.url)) {
    callback({ cancel: true });
    return;
  }

  // Always allow Outlook URLs to load
  if (isOutlookDomain(details.url)) {
    callback({});
    return;
  }

  const customBackgroundRedirect =
    customBackgroundService.beforeRequestHandlerRedirectUrl(details);

  if (customBackgroundRedirect) {
    callback(customBackgroundRedirect);
  }
  // Check if the counter was incremented
  else if (aboutBlankRequestCount < 1) {
    // Proceed normally
    callback({});
  } else {
    // Open the request externally
    console.debug("[REQUEST] Intercepted external request");
    shell.openExternal(details.url);
    // decrement the counter
    aboutBlankRequestCount -= 1;
    callback({ cancel: true });
  }
}

// Outlook domains whose enforcing CSP we never touch
const OUTLOOK_DOMAINS = [
  "outlook.office.com",
  "outlook.office365.com",
  "outlook.live.com",
  "res.public.onecdn.static.microsoft",
  "addin.insights.static.microsoft",
  "substrate.office.com",
];

/**
 * Checks whether a URL belongs to an Outlook domain or is an Outlook deep link.
 * Also handles Microsoft Cloud App Security (MCAS) proxy suffix.
 */
function isOutlookDomain(url) {
  try {
    const urlObj = new URL(url);
    let hostname = urlObj.hostname;
    if (hostname.endsWith(".mcas.ms")) {
      hostname = hostname.slice(0, -8);
    }
    if (OUTLOOK_DOMAINS.some(
      (d) => hostname === d || hostname.endsWith("." + d),
    )) {
      return true;
    }

    // Also check for specific Outlook deep link paths
    const outlookPaths = [
      "/mail/deeplink/compose",
      "/mail/0/deeplink/compose",
      "/calendar/deeplink",
      "/mail/inbox/id/",
      "/mail/sentitems/id/",
    ];
    const pathname = urlObj.pathname.toLowerCase();
    return outlookPaths.some((p) => pathname.includes(p));
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
  if (isOutlookDomain(url)) return;

  for (const key of Object.keys(responseHeaders)) {
    if (key.toLowerCase() === "content-security-policy-report-only") {
      let hostname;
      try {
        hostname = new URL(url).hostname;
      } catch {
        hostname = "unknown";
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
  if (new RegExp(config.meetupJoinRegEx).test(details.url)) {
    if (config.onNewWindowOpenMeetupJoinUrlInApp) {
      window.loadURL(details.url, { userAgent: config.chromeUserAgent });
    }
    return { action: "deny" };
  } else if (
    details.url === "about:blank" ||
    details.url === "about:blank#blocked"
  ) {
    // Outlook uses about:blank for compose windows — detect via window features
    const isComposeWindow = details.features && (
      details.features.includes("width=800") ||
      details.features.includes("resizable=1")
    );

    if (isComposeWindow) {
      return {
        action: "allow",
        overrideBrowserWindowOptions: {
          width: 800,
          height: 700,
          show: true,
          autoHideMenuBar: true,
          webPreferences: {
            partition: config.partition,
            contextIsolation: false,
            sandbox: false,
            spellcheck: true,
            preload: path.join(__dirname, "..", "browser", "preload-secondary.js"),
          },
        },
      };
    }

    // Regular about:blank for external links / auth flow
    aboutBlankRequestCount += 1;
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
    window.webContents.send(
      "navigation-state-changed",
      canGoBack,
      canGoForward,
    );
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

/**
 * Attaches context-menu and external-link handlers to a secondary window.
 * Called for both directly-created compose windows and windows created via window.open().
 */
function setupSecondaryWindowHandlers(win) {
  if (menus) {
    const menuAdapter = {
      window: win,
      spellCheckProvider: menus.spellCheckProvider,
      onSpellCheckerLanguageChanged: menus.onSpellCheckerLanguageChanged,
    };
    win.webContents.on("context-menu", Menus.assignContextMenuHandler(menuAdapter));
  }
  win.webContents.setWindowOpenHandler((details) => {
    if (
      details.url !== "about:blank" &&
      details.url !== "about:blank#blocked" &&
      !isOutlookDomain(details.url)
    ) {
      openInBrowser(details);
    }
    return { action: "deny" };
  });
}

function addEventHandlers() {
  customBackgroundService.initializeCustomBGServiceURL();

  // After resuming from sleep, check if auth cookies expired during suspend.
  // Electron on Linux lacks OS-level auth brokers (WAM/Keychain) that browsers
  // use to transparently refresh tokens, so we handle expiry ourselves.
  const { powerMonitor } = require("electron");
  powerMonitor.on("resume", async () => {
    console.debug("[AUTH_RECOVERY] System resumed, checking auth cookies");
    const result = await cleanExpiredAuthCookies(window.webContents.session);
    if (result.expired > 0) {
      console.info(
        "[AUTH_RECOVERY] Expired cookies found after resume, triggering recovery",
      );
      await triggerAuthRecovery();
    }
  });

  window.on("page-title-updated", onPageTitleUpdated);
  window.webContents.setWindowOpenHandler(onNewWindow);
  window.webContents.on("did-create-window", (createdWindow) => {
    setupSecondaryWindowHandlers(createdWindow);
  });
  window.webContents.session.webRequest.onBeforeRequest(
    { urls: ["https://*/*"] },
    onBeforeRequestHandler,
  );
  window.webContents.session.webRequest.onHeadersReceived(
    { urls: ["https://*/*"] },
    onHeadersReceivedHandler,
  );
  window.webContents.session.webRequest.onBeforeSendHeaders(
    getWebRequestFilterFromURL(),
    onBeforeSendHeadersHandler,
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

function onBeforeInput(_event, input) {
  isControlPressed = input.control;

  // Ctrl+Home: navigate back to Outlook home (recovery for stuck/broken sessions)
  if (input.control && input.key === "Home" && window) {
    window.webContents.loadURL(config.url);
  }
}

function secureOpenLink(details) {
  // Allow Outlook windows (compose, calendar, etc.) to open in Electron automatically
  if (isOutlookDomain(details.url)) {
    console.debug("[LINK] Outlook window detected, allowing in Electron");
    removePopupWindowMenu();
    return {
      action: "allow",
      overrideBrowserWindowOptions: {
        width: 1000,
        height: 800,
        show: true,
        autoHideMenuBar: true,
        webPreferences: {
          partition: config.partition,
          contextIsolation: false,
          sandbox: false,
          spellcheck: true,
          preload: path.join(__dirname, "..", "browser", "preload-secondary.js"),
        },
      },
    };
  }

  console.debug("[LINK] Requesting to open external link");
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
      openInBrowserErrorHandler,
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
