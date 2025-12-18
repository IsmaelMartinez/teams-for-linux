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
  'graph-api-get-mail-messages'
]);

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
  
  // Basic payload sanitization to prevent prototype pollution
  if (payload && typeof payload === 'object') {
    // Use Object.getOwnPropertyDescriptor to safely check and delete dangerous properties
    const dangerousProps = ['__proto__', 'constructor', 'prototype'];
    for (const prop of dangerousProps) {
      if (Object.hasOwn(payload, prop)) {
        delete payload[prop];
      }
    }
  }
  
  return true;
}

module.exports = { validateIpcChannel, allowedChannels };