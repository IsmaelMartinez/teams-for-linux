/**
 * IPC Security Validation Module
 * 
 * Provides security validation for IPC channels as a compensating control
 * for disabled contextIsolation and sandbox features.
 */

// Allowlist of legitimate IPC channels used by Teams for Linux
const allowedChannels = new Set([
  // Core application channels
  'config-file-changed',
  'config-changed',
  'get-config',
  'get-system-idle-state',
  'get-app-version',
  
  // Zoom and display controls
  'get-zoom-level',
  'save-zoom-level',
  
  // Screen sharing and desktop capture (sorted alphabetically)
  'cancel-desktop-media',
  'choose-desktop-media',
  'close-view',
  'desktop-capturer-get-sources',
  'get-screen-share-screen',
  'get-screen-share-stream',
  'get-screen-sharing-displays',
  'get-screen-sharing-status',
  'resize-preview-window',
  // main → renderer only (webContents.postMessage); not gated by this validator,
  // listed here so the allowlist stays authoritative per CLAUDE.md.
  'screen-share-port',
  'screen-sharing-started',
  'screen-sharing-stopped',
  'select-source',
  'selected-source',
  'source-selected',
  'stop-screen-sharing-from-thumbnail',
  
  // Notifications and user interaction
  'play-notification-sound',
  'show-notification',
  'notification-closed',
  'notification-show-toast',
  'notification-toast-click',
  'user-status-changed',
  'set-badge-count',
  'tray-update',
  
  // Call management (sorted alphabetically)
  'call-connected',
  'call-disconnected',
  'incoming-call-action',
  'incoming-call-created',
  'incoming-call-ended',
  'incoming-call-toast-ready',

  // Media status (camera/microphone)
  'camera-state-changed',
  'microphone-state-changed',
  
  // Authentication and forms
  'submitForm',
  
  // Settings management
  'get-teams-settings',
  'set-teams-settings',
  
  // Custom backgrounds
  'get-custom-bg-list',

  // Custom stickers
  'get-sticker-list',
  'import-sticker-url',
  'delete-sticker',
  
  // Connection management
  'offline-retry',

  // Navigation controls
  'navigate-back',
  'navigate-forward',
  'get-navigation-state',
  'navigation-state-changed',

  // Microsoft Graph API integration
  'graph-api-get-user-profile',
  'graph-api-get-calendar-events',
  'graph-api-get-calendar-view',
  'graph-api-create-calendar-event',
  'graph-api-get-mail-messages',
  'graph-api-search-people',
  'graph-api-send-chat-message',

  // Join meeting dialog
  'join-meeting-submit',
  'join-meeting-cancel',

  // Quick Chat modal
  'quick-chat:show',
  'quick-chat:hide',

  // Renderer-side error forwarding (registered in app/browser/preload.js)
  'unhandled-rejection',
  'window-error',

  // Multi-account profile switcher (ADR-020 Phase 1).
  // Handlers are registered only when `multiAccount.enabled === true`;
  // listing them here keeps the allowlist authoritative for the channels
  // the feature uses end-to-end.
  'profile-list',
  'profile-get-active',
  'profile-switch',
  'profile-add',
  'profile-update',
  'profile-remove',

  // Add-profile dialog (Phase 1c.2). Same `ipcMain.on` shape as
  // `join-meeting-*`; submit forwards the form record to
  // `ProfilesManager.add()`, cancel destroys the dialog.
  'add-profile-submit',
  'add-profile-cancel',

  // WebAuthn / FIDO2 security key support
  'webauthn:create',
  'webauthn:get',
  'webauthn:pin-submit',
  'webauthn:pin-cancel',

  // Manage-profiles dialog (Phase 1c.2). Inline rename forwards to
  // `ProfilesManager.update()`; remove triggers a native confirmation
  // before calling `ProfilesManager.remove()`. Close dismisses the
  // dialog. State pushes flow main → renderer over `manage-profile-state`
  // (no allowlist needed for that direction).
  'manage-profile-rename',
  'manage-profile-remove',
  'manage-profile-close'
]);

const DANGEROUS_PROPS = new Set(['__proto__', 'constructor', 'prototype']);
const MAX_SANITIZE_DEPTH = 10;

/**
 * Recursively sanitizes an object to remove prototype pollution vectors.
 * @param {any} obj - The object to sanitize
 * @param {number} depth - Current recursion depth (prevents stack overflow on circular refs)
 */
function sanitizePayload(obj, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > MAX_SANITIZE_DEPTH) {
    return;
  }

  for (const prop of DANGEROUS_PROPS) {
    if (Object.hasOwn(obj, prop)) {
      delete obj[prop];
    }
  }

  for (const key of Object.keys(obj)) {
    if (obj[key] && typeof obj[key] === 'object') {
      sanitizePayload(obj[key], depth + 1);
    }
  }
}

/**
 * Validates an IPC channel request
 * @param {string} channel - The IPC channel name
 * @param {any} payload - The payload being sent
 * @returns {boolean} - True if request is valid, false if blocked
 */
function validateIpcChannel(channel, payload = null) {
  // Check channel allowlist
  if (!allowedChannels.has(channel)) {
    console.warn(`[IPC Security] Blocked unauthorized channel: ${channel}`);
    return false;
  }

  // Recursive payload sanitization to prevent prototype pollution
  sanitizePayload(payload);

  return true;
}

/**
 * Validates the sender of an IPC message.
 *
 * All legitimate IPC traffic originates from preload scripts, which only run
 * in top-level frames (nodeIntegrationInSubFrames is never enabled). A call
 * arriving from a sub-frame therefore means remote page content — e.g. an
 * embedded iframe inside Teams — is reaching for privileged channels, and is
 * rejected.
 *
 * @param {Electron.IpcMainEvent|Electron.IpcMainInvokeEvent} event - The IPC event
 * @returns {boolean} - True if the sender is acceptable, false if blocked
 */
function validateIpcSender(event) {
  // Internal ipcMain.emit calls carry no sender; allow them.
  if (!event?.sender) {
    return true;
  }
  // A renderer-initiated message with no senderFrame means the frame was
  // destroyed mid-flight (e.g. a sub-frame that navigated to about:blank to
  // dodge this check), so reject it rather than allowing it.
  const frame = event.senderFrame;
  if (!frame) {
    console.warn('[IPC Security] Blocked IPC message with missing senderFrame');
    return false;
  }
  try {
    if (frame.parent !== null) {
      console.warn('[IPC Security] Blocked IPC message from sub-frame');
      return false;
    }
  } catch {
    // Property access on a disposed WebFrameMain throws; reject rather than allow.
    console.warn('[IPC Security] Blocked IPC message from disposed frame');
    return false;
  }
  return true;
}

module.exports = { validateIpcChannel, validateIpcSender, allowedChannels };