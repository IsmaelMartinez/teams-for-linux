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
  'get-screen-sharing-status',
  'resize-preview-window',
  'screen-sharing-started',
  'screen-sharing-stopped',
  'select-source',
  'selected-source',
  'source-selected',
  'stop-screen-sharing-from-thumbnail',
  
  // Notifications and user interaction
  'play-notification-sound',
  'show-notification',
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
  'quick-chat:hide'
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

module.exports = { validateIpcChannel, allowedChannels };