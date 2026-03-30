const { ipcRenderer } = require("electron");

// Intercept contextmenu on editable targets before Outlook's capture-phase handler
// so Chromium sends ShowContextMenu (enabling cut/copy/paste/spell-check via Electron's
// context-menu event). Non-editable targets (links, mailboxes) are left alone so
// Outlook's custom context menus continue to work there.
window.addEventListener('contextmenu', (e) => {
  const t = e.target;
  if (t.isContentEditable || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') {
    e.stopImmediatePropagation();
  }
}, true);

// Note: IPC validation handled by main process, no need for duplicate validation here
globalThis.electronAPI = {
  desktopCapture: {
    chooseDesktopMedia: (sources, cb) => {
      ipcRenderer
        .invoke("choose-desktop-media", sources)
        .then((streamId) => cb(streamId))
        .catch(err => {
          console.error('Desktop media choice failed:', err);
          cb(null);
        });
      return Date.now();
    },
    cancelChooseDesktopMedia: () => ipcRenderer.send("cancel-desktop-media"),
  },
  // Screen sharing events
  sendScreenSharingStarted: (sourceId) => {
    if (sourceId === null || (typeof sourceId === 'string' && sourceId.length < 100)) {
      return ipcRenderer.send("screen-sharing-started", sourceId);
    }
    console.error('Invalid sourceId for screen sharing');
  },
  sendScreenSharingStopped: () => ipcRenderer.send("screen-sharing-stopped"),
  stopSharing: () => ipcRenderer.send("stop-screen-sharing-from-thumbnail"),
  sendSelectSource: () => ipcRenderer.send("select-source"),
  onSelectSource: (callback) => ipcRenderer.once("select-source", callback),
  send: (channel, ...args) => {
    return ipcRenderer.send(channel, ...args);
  },

  // Configuration
  getConfig: () => ipcRenderer.invoke("get-config"),

  // Notifications with input validation
  showNotification: (options) => {
    if (!options || typeof options !== 'object') {
      return Promise.reject(new Error('Invalid notification options'));
    }
    return ipcRenderer.invoke("show-notification", options);
  },
  playNotificationSound: (options) => {
    if (options && typeof options !== 'object') {
      return Promise.reject(new Error('Invalid sound options'));
    }
    return ipcRenderer.invoke("play-notification-sound", options);
  },
  sendNotificationToast: (data) => {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid notification toast data');
    }
    ipcRenderer.send("notification-show-toast", data);
  },

  // Badge count with validation
  setBadgeCount: (count) => {
    if (typeof count !== 'number' || count < 0 || count > 9999) {
      console.error('Invalid badge count:', count);
      return Promise.reject(new Error('Invalid badge count'));
    }
    return ipcRenderer.invoke("set-badge-count", count);
  },

  // Tray icon with validation
  updateTray: (icon, flash) => {
    return ipcRenderer.send("tray-update", { icon, flash });
  },

  // Theme events
  onSystemThemeChanged: (callback) => {
    if (typeof callback !== 'function') {
      console.error('Invalid callback for theme changed');
      return;
    }
    return ipcRenderer.on("system-theme-changed", callback);
  },

  // User status with validation
  setUserStatus: (data) => {
    if (!data || typeof data !== 'object') {
      return Promise.reject(new Error('Invalid user status data'));
    }
    return ipcRenderer.invoke("user-status-changed", data);
  },

  // Zoom with validation
  getZoomLevel: (partition) => {
    if (typeof partition !== 'string' || partition.length > 100) {
      return Promise.reject(new Error('Invalid partition'));
    }
    return ipcRenderer.invoke("get-zoom-level", partition);
  },
  saveZoomLevel: (data) => {
    if (!data || typeof data !== 'object' || typeof data.level !== 'number') {
      return Promise.reject(new Error('Invalid zoom data'));
    }
    return ipcRenderer.invoke("save-zoom-level", data);
  },

  // Navigation
  navigateBack: () => ipcRenderer.send("navigate-back"),
  navigateForward: () => ipcRenderer.send("navigate-forward"),
  getNavigationState: () => ipcRenderer.invoke("get-navigation-state"),
  onNavigationStateChanged: (callback) => {
    if (typeof callback !== 'function') {
      console.error('Invalid callback for navigation state changed');
      return;
    }
    return ipcRenderer.on("navigation-state-changed", callback);
  },

  // Microsoft Graph API
  graphApi: {
    getUserProfile: () => ipcRenderer.invoke("graph-api-get-user-profile"),
    getCalendarEvents: (options) => ipcRenderer.invoke("graph-api-get-calendar-events", options),
    getCalendarView: (start, end, options) => ipcRenderer.invoke("graph-api-get-calendar-view", start, end, options),
    createCalendarEvent: (event) => ipcRenderer.invoke("graph-api-create-calendar-event", event),
    getMailMessages: (options) => ipcRenderer.invoke("graph-api-get-mail-messages", options),
  },

  // Outlook email notification from DOM observer
  showEmailNotification: (data) => {
    if (!data || typeof data !== 'object') {
      return Promise.reject(new Error('Invalid email notification data'));
    }
    return ipcRenderer.invoke("show-email-notification", data);
  },

  // Outlook reminder notification from DOM observer
  showReminderNotification: (data) => {
    if (!data || typeof data !== 'object') {
      return Promise.reject(new Error('Invalid reminder notification data'));
    }
    return ipcRenderer.invoke("show-reminder-notification", data);
  },

  // Update unread email count from DOM observer
  updateUnreadCount: (count) => {
    if (typeof count !== 'number' || count < 0) {
      return Promise.reject(new Error('Invalid unread count'));
    }
    return ipcRenderer.invoke("update-unread-count", count);
  },

  // Update active reminder count from DOM observer
  updateReminderCount: (count) => {
    if (typeof count !== 'number' || count < 0) {
      return Promise.reject(new Error('Invalid reminder count'));
    }
    return ipcRenderer.invoke("update-reminder-count", count);
  },

  // Chat deep link navigation (for quick chat access feature)
  openChatWithUser: (email) => {
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      console.error('Invalid email for chat deep link');
      return false;
    }
    // Use the current Outlook base URL (could be outlook.office.com or outlook.live.com)
    const currentOrigin = globalThis.location.origin;
    const chatPath = `/l/chat/0/0?users=${encodeURIComponent(email)}`;
    const chatUrl = `${currentOrigin}${chatPath}`;
    console.debug('[CHAT_LINK] Navigating to chat via deep link');
    globalThis.location.href = chatUrl;
    return true;
  },

  // System information (safe to expose)
  sessionType: "wayland",
};

// Fetch config and override Notification immediately (matching v2.2.1 pattern)
// Config is fetched asynchronously but notification function references it via closure
let notificationConfig = null;
ipcRenderer.invoke("get-config").then((config) => {
  notificationConfig = config;
  console.debug("Preload: Config loaded for notifications:", {
    notificationMethod: config?.notificationMethod,
    disableNotifications: config?.disableNotifications
  });
}).catch((err) => {
  console.error("Preload: Failed to load config for notifications:", err);
});

// Create a Notification-like stub so Teams can manage lifecycle without errors.
// Without addEventListener/close/dispatchEvent, Teams' internal state machine
// breaks after the first notification, causing subsequent ones to stop firing.
function createNotificationStub() {
  const stub = {
    onclick: null,
    onclose: null,
    onerror: null,
    onshow: null,
    close() { if (this.onclose) this.onclose(); },
    addEventListener(type, listener) {
      if (type === 'click') this.onclick = listener;
      else if (type === 'close') this.onclose = listener;
      else if (type === 'show') this.onshow = listener;
      else if (type === 'error') this.onerror = listener;
    },
    removeEventListener(type, listener) {
      if (type === 'click' && (!listener || this.onclick === listener)) this.onclick = null;
      else if (type === 'close' && (!listener || this.onclose === listener)) this.onclose = null;
      else if (type === 'show' && (!listener || this.onshow === listener)) this.onshow = null;
      else if (type === 'error' && (!listener || this.onerror === listener)) this.onerror = null;
    },
    dispatchEvent() { return true; },
  };
  // Fire the show event asynchronously like a real Notification
  setTimeout(() => { if (stub.onshow) stub.onshow(); }, 0);
  return stub;
}

// Helper functions for notification handling (extracted to reduce cognitive complexity)
function playNotificationSound(notifSound) {
  if (globalThis.electronAPI?.playNotificationSound) {
    try {
      console.debug("Requesting application to play sound");
      globalThis.electronAPI.playNotificationSound(notifSound);
    } catch (e) {
      console.debug("playNotificationSound failed", e);
    }
  }
}

function createWebNotification(classicNotification, title, options) {
  // Play notification sound
  const notifSound = {
    type: options.type,
    audio: "default",
    title: title,
    body: options.body,
  };
  playNotificationSound(notifSound);

  // Return actual native notification object (critical for Teams to manage lifecycle)
  console.debug("Continues to default notification workflow");
  if (classicNotification) {
    try {
      return new classicNotification(title, options);
    } catch (err) {
      console.debug("Could not create native notification:", err);
      return null;
    }
  }
  return null;
}

function createElectronNotification(options) {
  // Use Electron notification
  if (globalThis.electronAPI?.showNotification) {
    try {
      globalThis.electronAPI.showNotification(options);
    } catch (e) {
      console.debug("showNotification failed", e);
    }
  }
  return createNotificationStub();
}

function createCustomNotification(title, options) {
  // Send notification data to main process for custom toast notification
  const notificationData = {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    title: title,
    body: options.body || '',
    icon: options.icon,
  };

  // Play notification sound if enabled
  const notifSound = {
    type: options.type,
    audio: "default",
    title: title,
    body: options.body,
  };
  playNotificationSound(notifSound);

  // Send to main process to show toast
  try {
    if (globalThis.electronAPI?.sendNotificationToast) {
      globalThis.electronAPI.sendNotificationToast(notificationData);
    } else {
      console.warn("sendNotificationToast API not available");
    }
  } catch (e) {
    console.error("Failed to send custom notification:", e);
  }

  return createNotificationStub();
}

// Override window.Notification immediately before Teams loads
// Using factory function pattern instead of class to avoid "return in constructor" anti-pattern
(function() {
  const ICON_BASE64 =
    "data:image/png;base64,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";

  const classicNotification = globalThis.Notification;

  // Factory function that creates notification objects (avoids "return in constructor" issue)
  function CustomNotification(title, options) {
    // Use config from closure scope (will be null initially, populated async)
    if (notificationConfig?.disableNotifications) {
      // Return dummy object to avoid Teams errors
      return { onclick: null, onclose: null, onerror: null };
    }

    options = options || {};
    options.icon = options.icon || ICON_BASE64;
    options.title = options.title || title;
    options.type = options.type || "new-message";
    // Explicitly set false for Ubuntu Unity DE auto-close. Others are unaffected.
    options.requireInteraction = false;

    // Default to "web" if config not loaded yet
    const method = notificationConfig?.notificationMethod || "web";

    if (method === "custom") {
      return createCustomNotification(title, options);
    }

    if (method === "web") {
      const notification = createWebNotification(classicNotification, title, options);
      return notification || { onclick: null, onclose: null, onerror: null };
    }

    return createElectronNotification(options);
  }

  // Add static methods to factory function
  CustomNotification.requestPermission = async function() {
    return "granted";
  };

  Object.defineProperty(CustomNotification, 'permission', {
    get: function() {
      return "granted";
    }
  });

  globalThis.Notification = CustomNotification;
  console.debug("Preload: CustomNotification factory initialized");
})();

// Initialize browser modules after DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
  console.debug("Preload: DOMContentLoaded, initializing browser modules...");
  try {
    const config = await ipcRenderer.invoke("get-config");
    console.debug("Preload: Got config:", {
      trayIconEnabled: config?.trayIconEnabled,
      useMutationTitleLogic: config?.useMutationTitleLogic
    });
    
    // Initialize title monitoring using existing module
    if (config.useMutationTitleLogic) {
      const mutationTitle = require("./tools/mutationTitle");
      mutationTitle.init(config);
    }
    
    // Initialize tray icon functionality directly in preload with secure IPC
    if (config.trayIconEnabled) {
      // NOTE: unread-count event is handled by trayIconRenderer.js
      // This redundant listener was causing duplicate IPC traffic and rendering.
    }
    
    console.debug("Preload: Essential tray modules initialized successfully");
    
    // Initialize other modules safely
    const modules = [
      { name: "zoom", path: "./tools/zoom" },
      { name: "shortcuts", path: "./tools/shortcuts" },
      { name: "settings", path: "./tools/settings" },
      { name: "theme", path: "./tools/theme" },
      { name: "emulatePlatform", path: "./tools/emulatePlatform" },
      { name: "timestampCopyOverride", path: "./tools/timestampCopyOverride" },
      { name: "trayIconRenderer", path: "./tools/trayIconRenderer" },
      { name: "mqttStatusMonitor", path: "./tools/mqttStatusMonitor" },
      { name: "disableAutogain", path: "./tools/disableAutogain" },
      { name: "speakingIndicator", path: "./tools/speakingIndicator" },
      { name: "cameraResolution", path: "./tools/cameraResolution" },
      { name: "cameraAspectRatio", path: "./tools/cameraAspectRatio" },
      { name: "navigationButtons", path: "./tools/navigationButtons" },
      { name: "framelessTweaks", path: "./tools/frameless" }
    ];

    // CRITICAL: These modules need ipcRenderer for IPC communication (see CLAUDE.md)
    const modulesRequiringIpc = new Set(["settings", "theme", "trayIconRenderer", "mqttStatusMonitor"]);

    let successCount = 0;
    for (const module of modules) {
      try {
        const moduleInstance = require(module.path);
        if (modulesRequiringIpc.has(module.name)) {
          moduleInstance.init(config, ipcRenderer);
        } else {
          moduleInstance.init(config);
        }
        successCount++;
      } catch (err) {
        console.error(`Preload: Failed to load ${module.name}:`, err.message);
      }
    }
    
    console.info(`Preload: ${successCount}/${modules.length} browser modules initialized successfully`);

    // Initialize ActivityManager
    try {
      const ActivityManager = require("./notifications/activityManager");
      new ActivityManager(ipcRenderer, config).start();
    } catch (err) {
      console.error("Preload: ActivityManager failed to initialize:", err.message);
    }

    // Initialize Outlook-specific notification interception (email/reminder DOM observers)
    if (!config.disableNotifications) {
      initOutlookNotificationInterception();
      setupUnreadCountObserver();
      setupReminderCountObserver();
    }

    // Listen for config changes from the main process (e.g., when menu toggles are clicked)
    ipcRenderer.on("config-changed", (_event, configChanges) => {
      // Update the local config object with the changes
      for (const [key, value] of Object.entries(configChanges)) {
        config[key] = value;
      }
    });

  } catch (error) {
    console.error("Preload: Failed to initialize browser modules:", error);
  }
});

// Forward unhandled promise rejections and window errors to main for diagnostics with secure IPC
try {
  globalThis.addEventListener("unhandledrejection", (event) => {
    try {
      const reason = event?.reason;
      const errorData = {
        message: reason?.message ? String(reason.message).substring(0, 1000) : String(reason).substring(0, 1000),
        stack: reason?.stack ? String(reason.stack).substring(0, 5000) : null,
        timestamp: Date.now(),
        // Keep the raw reason only when it's a plain object to avoid huge payloads
        reason: typeof reason === "object" && reason !== null ? reason : null,
      };
      
      ipcRenderer.send("unhandled-rejection", errorData);
    } catch (err) {
      console.debug("Unhandled rejection forwarding failed:", err);
      // Best-effort forwarding, never throw from preload
    }
  });

  globalThis.addEventListener("error", (event) => {
    try {
      const errorData = {
        message: event?.message ? String(event.message).substring(0, 1000) : '',
        filename: event?.filename ? String(event.filename).substring(0, 200) : '',
        lineno: typeof event?.lineno === 'number' ? event.lineno : 0,
        colno: typeof event?.colno === 'number' ? event.colno : 0,
        timestamp: Date.now(),
        errorStack: event?.error?.stack ? String(event.error.stack).substring(0, 5000) : null,
      };
      
      ipcRenderer.send("window-error", errorData);
    } catch (err) {
      console.debug("Window error forwarding failed:", err);
    }
  });
} catch (err) {
  console.debug("Error handler setup failed:", err);
}

// ──────────────────────────────────────────────────────────────────────────────
// Outlook-specific notification interception
// Detects email and reminder notifications from Outlook's DOM, plus unread/reminder counts.
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Initialize MutationObserver to intercept Outlook notification elements
 */
function initOutlookNotificationInterception() {
  const setupObserver = () => {
    const notificationPane = document.querySelector('[data-app-section="NotificationPane"]');

    if (notificationPane) {
      console.debug('[Outlook Notifications] Found NotificationPane, setting up observer');
      observeNotificationPane(notificationPane);
    } else {
      console.debug('[Outlook Notifications] NotificationPane not found, observing body');
      observeForNotificationPane();
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(setupObserver, 2000));
  } else {
    setTimeout(setupObserver, 2000);
  }
}

function observeForNotificationPane() {
  const bodyObserver = new MutationObserver(() => {
    const notificationPane = document.querySelector('[data-app-section="NotificationPane"]');
    if (notificationPane) {
      bodyObserver.disconnect();
      observeNotificationPane(notificationPane);
    }
  });

  if (document.body) {
    bodyObserver.observe(document.body, { childList: true, subtree: true });
  } else {
    setTimeout(observeForNotificationPane, 1000);
  }
}

function observeNotificationPane(notificationPane) {
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach(node => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          processNotificationElement(node);
        }
      });
    }
  });

  observer.observe(notificationPane, { childList: true, subtree: true });
  console.debug('[Outlook Notifications] Observer attached to NotificationPane');
}

function processNotificationElement(element) {
  // Check for reminder notifications (divs with timeuntildisplaystring attribute)
  const reminderDivs = element.querySelectorAll
    ? [...element.querySelectorAll('[timeuntildisplaystring]')]
    : [];

  if (element.hasAttribute && element.hasAttribute('timeuntildisplaystring')) {
    reminderDivs.push(element);
  }

  for (const reminderDiv of reminderDivs) {
    const reminderData = extractReminderData(reminderDiv);
    if (reminderData) {
      console.debug('[Outlook Notifications] Reminder detected:', reminderData.subject);
      globalThis.electronAPI.showReminderNotification(reminderData);
    }
  }

  // Check for email notifications (buttons with aria-label)
  const emailButtons = element.querySelectorAll
    ? [...element.querySelectorAll('button[aria-label]'),
       ...(element.matches?.('button[aria-label]') ? [element] : [])]
    : [];

  if (element.tagName === 'BUTTON' && element.hasAttribute('aria-label')) {
    emailButtons.push(element);
  }

  for (const button of emailButtons) {
    if (isEmailNotification(button)) {
      const ariaLabel = button.getAttribute('aria-label') || '';
      const emailData = extractEmailData(button, ariaLabel);
      if (emailData) {
        console.debug('[Outlook Notifications] Email detected:', emailData.subject);
        globalThis.electronAPI.showEmailNotification(emailData);
      }
    }
  }
}

/**
 * Check if button is an email notification by Outlook DOM structure
 * Email notifications have: .ZJg8d (sender), .KTZ84 (subject), .mrxI1 (body)
 */
function isEmailNotification(button) {
  return !!(button.querySelector('.ZJg8d') && button.querySelector('.KTZ84') && button.querySelector('.mrxI1'));
}

/**
 * Extract email data from notification button
 */
function extractEmailData(button, ariaLabel) {
  const senderElement = button.querySelector('.ZJg8d > div:first-child');
  const sender = senderElement?.textContent?.trim();

  const subjectElement = button.querySelector('.KTZ84');
  const subject = subjectElement?.textContent?.trim();

  const bodyElement = button.querySelector('.mrxI1');
  let messageBody = '';

  if (bodyElement) {
    const fullText = bodyElement.textContent;
    const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/;
    const lines = fullText.split('\n');
    const cleanLines = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (emailRegex.test(trimmed)) break;
      if (/\d{4}\./.test(trimmed) || /\d{1,2},\s*\d{4}/.test(trimmed)) break;
      if (/:\s*$/.test(trimmed) && trimmed.length < 50) break;
      if (trimmed && cleanLines.length < 3) {
        cleanLines.push(trimmed);
      } else if (cleanLines.length >= 3) {
        break;
      }
    }

    messageBody = cleanLines.join('\n');
  }

  const formattedAddress = sender || (() => {
    const colonIndex = ariaLabel.indexOf(':');
    return colonIndex > -1 ? ariaLabel.substring(colonIndex + 1).trim() : 'Unknown';
  })();

  return {
    address: formattedAddress,
    subject: subject || 'New message',
    body: messageBody
  };
}

/**
 * Extract reminder data from DOM element attributes
 */
function extractReminderData(element) {
  const subject = element.getAttribute('subject') || '';
  if (!subject) return null;

  return {
    subject,
    location: element.getAttribute('location') || '',
    timeUntil: element.getAttribute('timeuntildisplaystring') || '',
    startTime: element.getAttribute('starttimedisplaystring') || '',
    reminderType: element.getAttribute('remindertype') || 'Reminder'
  };
}

/**
 * Setup observer to watch Outlook's unread email counter (.WIYG1.Mt2TB elements)
 */
function setupUnreadCountObserver() {
  try {
    let debounceTimer;
    const debouncedCheck = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(checkUnreadCount, 100);
    };

    const checkUnreadCount = () => {
      try {
        const unreadElements = document.querySelectorAll('.WIYG1.Mt2TB');
        let totalCount = 0;
        for (const element of unreadElements) {
          if (element.closest('[aria-labelledby="favoritesRoot"]')) continue;
          totalCount += parseInt(element.textContent) || 0;
        }
        globalThis.electronAPI.updateUnreadCount(totalCount);
      } catch (e) {
        console.error('[Unread Counter] Error:', e);
      }
    };

    const observer = new MutationObserver((mutations) => {
      let relevantMutation = false;
      for (const mutation of mutations) {
        for (const nodeList of [mutation.addedNodes, mutation.removedNodes]) {
          if (!nodeList) continue;
          for (const node of nodeList) {
            if (node.nodeType === 1 && (node.classList?.contains('WIYG1') ||
                node.querySelector?.('.WIYG1.Mt2TB'))) {
              relevantMutation = true;
            }
          }
        }
        if (mutation.type === 'characterData' && mutation.target.parentElement?.classList.contains('WIYG1')) {
          relevantMutation = true;
        }
      }
      if (relevantMutation) debouncedCheck();
    });

    const targetNode = document.documentElement || document;
    observer.observe(targetNode, { childList: true, subtree: true, characterData: true });

    // Poll for initial elements
    let attempts = 0;
    const pollForElements = () => {
      if (document.querySelectorAll('.WIYG1.Mt2TB').length > 0) {
        checkUnreadCount();
      } else if (attempts < 20) {
        attempts++;
        setTimeout(pollForElements, 500);
      }
    };
    setTimeout(pollForElements, 1000);
  } catch (e) {
    console.error('[Unread Counter] Setup error:', e);
  }
}

/**
 * Setup observer to watch for active reminders (elements with timeuntildisplaystring)
 */
function setupReminderCountObserver() {
  try {
    let debounceTimer;
    const debouncedCheck = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(checkReminderCount, 100);
    };

    const checkReminderCount = () => {
      try {
        const totalCount = document.querySelectorAll('[timeuntildisplaystring]').length;
        globalThis.electronAPI.updateReminderCount(totalCount);
      } catch (e) {
        console.error('[Reminder Counter] Error:', e);
      }
    };

    const observer = new MutationObserver((mutations) => {
      let relevantMutation = false;
      for (const mutation of mutations) {
        for (const nodeList of [mutation.addedNodes, mutation.removedNodes]) {
          if (!nodeList) continue;
          for (const node of nodeList) {
            if (node.nodeType === 1 && (node.hasAttribute?.('timeuntildisplaystring') ||
                node.querySelector?.('[timeuntildisplaystring]'))) {
              relevantMutation = true;
            }
          }
        }
      }
      if (relevantMutation) debouncedCheck();
    });

    const targetNode = document.documentElement || document;
    observer.observe(targetNode, { childList: true, subtree: true });

    setTimeout(checkReminderCount, 1000);
  } catch (e) {
    console.error('[Reminder Counter] Setup error:', e);
  }
}
