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

function createScreenSharePreviewWindow(selectedSource) {
  const path = require("path");

  // Get configuration - use the module-level config variable
  let thumbnailConfig = config?.screenSharingThumbnail?.default;
  if (!thumbnailConfig) {
    thumbnailConfig = config?.screenSharingThumbnail;
  }
  if (!thumbnailConfig) {
    thumbnailConfig = { enabled: true, alwaysOnTop: true };
  }

  if (!thumbnailConfig.enabled) {
    return;
  }

  // Don't create duplicate windows
  if (global.previewWindow && !global.previewWindow.isDestroyed()) {
    global.previewWindow.focus();
    return;
  }

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

  global.previewWindow.loadFile(
    path.join(__dirname, "..", "screenSharing", "previewWindow.html")
  );

  global.previewWindow.once("ready-to-show", () => {
    global.previewWindow.show();
  });

  global.previewWindow.on("closed", () => {
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
    intune.initSso(config.ssoInTuneAuthUser);
  }

  if (config.trayIconEnabled) {
    iconChooser = new TrayIconChooser(config);

    if (isMac) {
      console.log("Setting Dock icon for macOS");
      const icon = nativeImage.createFromPath(iconChooser.getFile());
      const iconSize = icon.getSize();
      if (iconSize.width < 128) {
        console.warn(
          "unable to set dock icon for macOS, icon size is less than 128x128, current size " +
            iconSize.width +
            "x" +
            iconSize.height
        );
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
    (request, callback) => {
      streamSelector.show((source) => {
        if (source) {
          desktopCapturer
            .getSources({ types: ["window", "screen"] })
            .then((sources) => {
              const selectedSource = sources.find((s) => s.id === source.id);
              if (selectedSource) {
                // Store the source ID globally for access by screen sharing manager
                global.selectedScreenShareSource = selectedSource;

                // Create preview window for screen sharing
                createScreenSharePreviewWindow(selectedSource);
              }
              callback({ video: selectedSource });
            });
        } else {
          callback({ video: null, audio: false });
        }
      });
    }
  );

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
  injectNotificationLogic();

  customCSS.onDidFinishLoad(window.webContents, config);
  initSystemThemeFollow(config);
}

function injectScreenSharingLogic() {
  const screenSharingScript = `
    (function() {
      let isScreenSharing = false;
      let activeStreams = [];
      let activeMediaTracks = [];
      
      // Monitor for screen sharing streams and detect when they stop
      function monitorScreenSharing() {
        
        // Hook into getDisplayMedia for screen sharing
        const originalGetDisplayMedia = navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices);
        
        navigator.mediaDevices.getDisplayMedia = function(constraints) {
          return originalGetDisplayMedia(constraints).then(stream => {
            console.debug('Screen sharing stream detected via getDisplayMedia');
            handleScreenShareStream(stream, 'getDisplayMedia');
            return stream;
          }).catch(error => {
            console.error('getDisplayMedia error:', error);
            throw error;
          });
        };
        
        // Also hook into getUserMedia for fallback detection
        const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        
        navigator.mediaDevices.getUserMedia = function(constraints) {
          return originalGetUserMedia(constraints).then(stream => {
            
            // Check if this is a screen sharing stream - handle multiple constraint formats
            const isScreenShare = constraints && constraints.video && (
              // Electron format
              constraints.video.chromeMediaSource === 'desktop' ||
              constraints.video.mandatory?.chromeMediaSource === 'desktop' ||
              // Teams format  
              constraints.video.chromeMediaSourceId ||
              constraints.video.mandatory?.chromeMediaSourceId ||
              // Generic desktop capture
              (typeof constraints.video === 'object' && constraints.video.deviceId && 
               typeof constraints.video.deviceId === 'object' && constraints.video.deviceId.exact)
            );
            
            if (isScreenShare) {
              console.debug('Screen sharing stream detected');
              handleScreenShareStream(stream, 'getUserMedia');
            }
            
            return stream;
          }).catch(error => {
            console.error('getUserMedia error:', error);
            throw error;
          });
        };
      }
      
      // Centralized handler for screen sharing streams
      function handleScreenShareStream(stream, source) {
        console.debug('Screen sharing stream started from:', source);
        
        const electronAPI = window.electronAPI;
        
        if (!electronAPI) {
          console.error('electronAPI not available');
          return;
        }
        
        isScreenSharing = true;
        activeStreams.push(stream);
        
        // Send screen sharing started event
        if (electronAPI.sendScreenSharingStarted) {
          const sourceId = 'screen-share-' + Date.now();
          electronAPI.sendScreenSharingStarted(sourceId);
          electronAPI.send("active-screen-share-stream", stream);
        }
        
        // Start UI monitoring for stop sharing buttons
        startUIMonitoring();
        
        // Track stream and tracks for reference, but don't auto-close popup based on their state
        // Popup window should only close when manually closed or screen sharing explicitly stopped
        const videoTracks = stream.getVideoTracks();
        activeMediaTracks.push(...videoTracks);
        
        // Optional: Log when tracks end (for debugging, doesn't affect popup)
        videoTracks.forEach((track, index) => {
          track.addEventListener('ended', () => {
            console.debug('Video track', index, 'ended (popup remains open)');
          });
        });
      }
      
      // Function to handle stream ending - used by UI button detection
      function handleStreamEnd(reason) {
        console.debug('Stream ending detected, reason:', reason);
        
        if (isScreenSharing) {
          isScreenSharing = false;
          
          const electronAPI = window.electronAPI;
          if (electronAPI && electronAPI.sendScreenSharingStopped) {
            electronAPI.sendScreenSharingStopped();
          }
          
          // Clear active streams and tracks
          activeStreams = [];
          activeMediaTracks = [];
        }
      }
      
      // Monitor Teams UI for stop sharing actions
      function startUIMonitoring() {
        console.debug('Starting UI monitoring for screen sharing controls');
        
        // Look for common screen sharing control selectors
        const stopSharingSelectors = [
          '[data-tid*="stop-share"]',
          '[data-tid*="stopShare"]',
          '[data-tid*="screen-share"][data-tid*="stop"]',
          'button[title*="Stop sharing"]',
          'button[aria-label*="Stop sharing"]',
          '[data-tid="call-screen-share-stop-button"]',
          '[data-tid="desktop-share-stop-button"]',
          '.ts-calling-screen-share-stop-button',
          'button[data-testid*="stop-sharing"]',
          '[data-tid*="share"] button',
          '.share-stop-button',
          '[aria-label*="share"]',
          '[title*="share"]',
          '[data-tid*="hangup"]',
          '[data-tid*="call-end"]',
          'button[data-tid="call-hangup"]'
        ];
        
        // Monitor for clicks on stop sharing buttons
        function addStopSharingListeners() {
          let foundButtons = 0;
          
          stopSharingSelectors.forEach(selector => {
            const elements = document.querySelectorAll(selector);
            
            elements.forEach(element => {
              if (!element.hasAttribute('data-screen-share-monitored')) {
                foundButtons++;
                element.setAttribute('data-screen-share-monitored', 'true');
                element.addEventListener('click', handleStopSharing);
              }
            });
          });
          
          if (foundButtons > 0) {
            console.debug('Added stop sharing listeners to', foundButtons, 'buttons');
          }
        }
        
        // Handle stop sharing button clicks
        function handleStopSharing(event) {
          console.debug('Stop sharing button clicked');
          
          if (isScreenSharing) {
            // Force stop all active media tracks
            activeMediaTracks.forEach((track) => {
              track.stop();
            });
            
            // Force stop all active streams
            activeStreams.forEach((stream) => {
              stream.getTracks().forEach(track => {
                track.stop();
              });
            });
            
            setTimeout(() => {
              handleStreamEnd('ui-button-click');
            }, 500); // Small delay to let Teams process the stop action
          }
        }
        
        // Monitor for DOM changes and add listeners to new buttons
        const observer = new MutationObserver((mutations) => {
          let shouldCheckForButtons = false;
          mutations.forEach(mutation => {
            if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
              shouldCheckForButtons = true;
            }
          });
          
          if (shouldCheckForButtons) {
            addStopSharingListeners();
          }
        });
        
        // Start observing
        observer.observe(document.body, {
          childList: true,
          subtree: true
        });
        
        // Initial check
        addStopSharingListeners();
        
        // Periodic check as fallback  
        const checkInterval = setInterval(() => {
          if (isScreenSharing) {
            addStopSharingListeners();
          } else {
            clearInterval(checkInterval);
          }
        }, 2000);
      }
      
      // Manual test trigger - Ctrl+Shift+X to force close screen sharing
      function addManualTestTrigger() {
        document.addEventListener('keydown', function(event) {
          if (event.ctrlKey && event.shiftKey && event.key === 'X') {
            const electronAPI = window.electronAPI;
            if (electronAPI && electronAPI.sendScreenSharingStopped) {
              handleStreamEnd('manual-test-trigger');
            }
            event.preventDefault();
          }
        });
      }
      
      // Initialize monitoring
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
          monitorScreenSharing();
          addManualTestTrigger();
        });
      } else {
        monitorScreenSharing();
        addManualTestTrigger();
      }
      
    })();
  `;

  window.webContents.executeJavaScript(screenSharingScript);
}

function injectNotificationLogic() {
  const notificationScript = `
    (function() {
      console.debug('Injecting notification logic');
      
      let classicNotification = window.Notification;
      
      class CustomNotification {
        constructor(title, options) {
          const electronAPI = window.electronAPI;
          if (!electronAPI) {
            return new classicNotification(title, options);
          }
          
          options = options || {};
          options.icon = options.icon
            ? options.icon
            : "data:image/png;base64,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";
          options.title = options.title ? options.title : title;
          options.type = options.type ? options.type : "new-message";
          options.requireInteraction = false;

          // Get config to determine notification method
          electronAPI.getConfig().then((config) => {
            if (config.disableNotifications) {
              return;
            }
            
            if (config.notificationMethod === "web") {
              const notifSound = {
                type: options.type,
                audio: "default",
                title: title,
                body: options.body,
              };
              console.debug("Requesting application to play sound");
              electronAPI.playNotificationSound(notifSound);
              console.debug("Continues to default notification workflow");
              return new classicNotification(title, options);
            } else {
              electronAPI.showNotification(options);
            }
          });
          
          return { onclick: null, onclose: null, onerror: null };
        }

        static async requestPermission() {
          return "granted";
        }

        static get permission() {
          return "granted";
        }
      }
      
      window.Notification = CustomNotification;
    })();
  `;

  window.webContents.executeJavaScript(notificationScript);
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
