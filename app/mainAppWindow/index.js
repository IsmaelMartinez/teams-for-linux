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
const { execFile } = require("child_process");
const TrayIconChooser = require("../browser/tools/trayIconChooser");
require("../appConfiguration");
const connMgr = require("../connectionManager");
const BrowserWindowManager = require("../mainAppWindow/browserWindowManager");
const os = require("os");
const path = require("path");

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

const isMac = os.platform() === "darwin";

function createScreenSharePreviewWindow() {
  const path = require("path");
  const startTime = Date.now();

  // Get configuration - use the module-level config variable
  let thumbnailConfig =
    config?.screenSharingThumbnail?.default ??
    config?.screenSharingThumbnail ??
    DEFAULT_SCREEN_SHARING_THUMBNAIL_CONFIG;

  console.debug("[SCREEN_SHARE_DIAG] Preview window creation requested", {
    enabled: thumbnailConfig.enabled,
    alwaysOnTop: thumbnailConfig.alwaysOnTop || false,
    existingWindow: global.previewWindow && !global.previewWindow.isDestroyed(),
    activeSource: global.selectedScreenShareSource,
    timestamp: new Date().toISOString()
  });

  if (!thumbnailConfig.enabled) {
    console.debug("[SCREEN_SHARE_DIAG] Preview window disabled in configuration");
    return;
  }

  // Don't create duplicate windows - this is critical for preventing echo
  if (global.previewWindow && !global.previewWindow.isDestroyed()) {
    console.warn("[SCREEN_SHARE_DIAG] Preview window already exists, focusing existing", {
      riskLevel: "MEDIUM - multiple preview windows could cause audio issues",
      action: "focusing existing window instead of creating new",
      windowId: global.previewWindow.id
    });
    global.previewWindow.focus();
    return;
  }

  console.debug("[SCREEN_SHARE_DIAG] Creating new preview window", {
    dimensions: "320x180",
    alwaysOnTop: thumbnailConfig.alwaysOnTop || false,
    partition: "persist:teams-for-linux-session"
  });

  global.previewWindow = new BrowserWindow({
    width: 320,
    height: 180,
    minWidth: 200,
    minHeight: 120,
    show: false,
    resizable: true,
    alwaysOnTop: thumbnailConfig.alwaysOnTop || false,
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

  const windowId = global.previewWindow.id;
  console.debug("[SCREEN_SHARE_DIAG] Preview BrowserWindow created", {
    windowId: windowId,
    creationTimeMs: Date.now() - startTime,
    alwaysOnTop: thumbnailConfig.alwaysOnTop || false
  });

  global.previewWindow.loadFile(
    path.join(__dirname, "..", "screenSharing", "previewWindow.html")
  );

  global.previewWindow.once("ready-to-show", () => {
    console.debug("[SCREEN_SHARE_DIAG] Preview window ready, showing now", {
      windowId: windowId,
      totalCreationTimeMs: Date.now() - startTime,
      focused: global.previewWindow.isFocused(),
      visible: global.previewWindow.isVisible()
    });
    global.previewWindow.show();
  });

  // Add focus/blur event handlers to detect when preview window gets focus
  global.previewWindow.on("focus", () => {
    console.debug("[SCREEN_SHARE_DIAG] Preview window gained focus", {
      windowId: windowId,
      potentialIssue: "Focus on preview might interfere with main Teams window"
    });
  });

  global.previewWindow.on("blur", () => {
    console.debug("[SCREEN_SHARE_DIAG] Preview window lost focus", {
      windowId: windowId
    });
  });

  global.previewWindow.on("closed", () => {
    console.debug("[SCREEN_SHARE_DIAG] Preview window closed", {
      windowId: windowId,
      hadActiveSource: !!global.selectedScreenShareSource,
      closedSource: global.selectedScreenShareSource
    });
    global.previewWindow = null;
    global.selectedScreenShareSource = null;
  });
}

exports.onAppReady = async function onAppReady(configGroup, customBackground) {
  appConfig = configGroup;
  config = configGroup.startupConfig;
  customBackgroundService = customBackground;

  if (config.ssoInTuneEnabled) {
    intune = require("../intune");
    await intune.initSso(config.ssoInTuneAuthUser);
  }

  if (config.trayIconEnabled) {
    iconChooser = new TrayIconChooser(config);

    if (isMac) {
      console.log("Setting Dock icon for macOS");
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
          `Unable to set dock icon for macOS, icon size is less than 128x128, current size ${iconSize.width}x${iconSize.height}. Using resized icon.`
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

  window.webContents.session.setDisplayMediaRequestHandler(
    (_request, callback) => {
      streamSelector.show((source) => {
        if (source) {
          handleScreenSourceSelection(source, callback);
        } else {
          callback({ video: null });
        }
      });
    }
  );

  function handleScreenSourceSelection(source, callback) {
    desktopCapturer
      .getSources({ types: ["window", "screen"] })
      .then((sources) => {
        const selectedSource = findSelectedSource(sources, source);
        if (selectedSource) {
          setupScreenSharing(selectedSource);
        }
        callback({ video: selectedSource });
      });
  }

  function findSelectedSource(sources, source) {
    return sources.find((s) => s.id === source.id);
  }

  function setupScreenSharing(selectedSource) {
    // Store the source ID globally for access by screen sharing manager
    global.selectedScreenShareSource = selectedSource;

    // Create preview window for screen sharing
    createScreenSharePreviewWindow();
  }

  if (iconChooser) {
    const m = new Menus(window, configGroup, iconChooser.getFile());
    m.onSpellCheckerLanguageChanged = onSpellCheckerLanguageChanged;
  }

  addEventHandlers();

  login.handleLoginDialogTry(window, {
    ssoBasicAuthUser: config.ssoBasicAuthUser,
    ssoBasicAuthPasswordCommand: config.ssoBasicAuthPasswordCommand,
  });

  const url = processArgs(process.argv);
  connMgr.start(url, {
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

  if (
    typeof config.clientCertPath !== "undefined" &&
    config.clientCertPath !== ""
  ) {
    app.importCertificate(
      {
        certificate: config.clientCertPath,
        password: config.clientCertPassword,
      },
      (result) => {
        console.info(
          "Loaded certificate: " + config.clientCertPath + ", result: " + result
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
    spellCheckProvider.setLanguages(languages).length == 0 &&
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
  window.webContents.executeJavaScript(`
			openBrowserButton = document.querySelector('[data-tid=joinOnWeb]');
			openBrowserButton && openBrowserButton.click();
		`);
  window.webContents.executeJavaScript(`
			tryAgainLink = document.getElementById('try-again-link');
			tryAgainLink && tryAgainLink.click()
		`);

  // Inject browser functionality
  injectScreenSharingLogic();

  customCSS.onDidFinishLoad(window.webContents, config);
  initSystemThemeFollow(config);
}

function injectScreenSharingLogic() {
  const fs = require("fs");
  const path = require("path");
  const scriptPath = path.join(
    __dirname,
    "..",
    "screenSharing",
    "injectedScreenSharing.js"
  );
  try {
    const script = fs.readFileSync(scriptPath, "utf8");
    window.webContents.executeJavaScript(script);
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

function onBeforeRequestHandler(details, callback) {
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
    console.debug("DEBUG - webRequest to  " + details.url + " intercepted!");
    console.debug(
      "Opening the request in a hidden child window for authentication"
    );
    const child = new BrowserWindow({ parent: window, show: false });
    child.loadURL(details.url);
    child.once("ready-to-show", () => {
      console.debug("Destroying the hidden child window");
      child.destroy();
    });

    // decrement the counter
    aboutBlankRequestCount -= 1;
    callback({ cancel: true });
  }
}

function onHeadersReceivedHandler(details, callback) {
  customBackgroundService.onHeadersReceivedHandler(details);
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
  console.debug(
    `testing RegExp onNewWindow ${new RegExp(config.meetupJoinRegEx).test(
      details.url
    )}`
  );
  if (new RegExp(config.meetupJoinRegEx).test(details.url)) {
    console.debug("DEBUG - captured meetup-join url");
    if (config.onNewWindowOpenMeetupJoinUrlInApp) {
      window.loadURL(details.url, { userAgent: config.chromeUserAgent });
    }
    return { action: "deny" };
  } else if (
    details.url === "about:blank" ||
    details.url === "about:blank#blocked"
  ) {
    // Increment the counter
    aboutBlankRequestCount += 1;
    console.debug("DEBUG - captured about:blank");
    return { action: "deny" };
  }

  return secureOpenLink(details);
}

function onPageTitleUpdated(_event, title) {
  window.webContents.send("page-title", title);
}

function onWindowClosed() {
  console.debug("window closed");
  window = null;
  app.quit();
}

function addEventHandlers() {
  customBackgroundService.initializeCustomBGServiceURL();
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
}

function secureOpenLink(details) {
  console.debug(`Requesting to open '${details.url}'`);
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
  if (config.defaultURLHandler.trim() !== "") {
    execFile(
      config.defaultURLHandler.trim(),
      [details.url],
      openInBrowserErrorHandler
    );
  } else {
    shell.openExternal(details.url);
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
