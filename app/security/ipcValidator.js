/**
 * IPC Security Validation Module
 * 
 * Provides security validation for IPC channels as a compensating control
 * for disabled contextIsolation and sandbox features.
 */

// Allowlist of legitimate IPC channels used by Teams for Linux
export const allowedChannels = new Set([
	// Core application channels
	'config-file-changed',
	'config-changed',
	'get-config',
	'get-system-idle-state',
	'get-app-version',
	
	// Zoom and display controls
	'get-zoom-level',
	'save-zoom-level',
	
	// Screen sharing and desktop capture
	'desktop-capturer-get-sources',
	'choose-desktop-media',
	'cancel-desktop-media',
	'select-source',
	'selected-source',
	'close-view',
	'get-screen-sharing-status',
	'get-screen-share-stream',
	'get-screen-share-screen',
	'screen-sharing-started',
	'screen-sharing-stopped',
	'resize-preview-window',
	'stop-screen-sharing-from-thumbnail',
	'get-screen-sharing-preview-source',
	
	// Notifications and user interaction
	'play-notification-sound',
	'show-notification',
	'notification-show-toast',
	'notification-toast-click',
	'notification-close-toast',
	'notification-toast-clicked',
	'notification-data',
	'user-status-changed',
	'set-badge-count',
	'tray-update',
	
	// Call management
	'incoming-call-created',
	'incoming-call-ended',
	'incoming-call-action',
	'incoming-call-toast-clicked',
	'call-connected',
	'call-disconnected',

	// Media status (camera/microphone)
	'camera-state-changed',
	'microphone-state-changed',
	
	// Wakelock
	'enable-wakelock',
	'disable-wakelock',
	
	// Authentication and forms
	'submitForm',
	
	// Custom backgrounds
	'get-custom-bg-list',
	
	// Connection management
	'offline-retry',

	// Navigation controls
	'navigate-back',
	'navigate-forward',
	'get-navigation-state',
	'navigation-state-changed',
	
	// Theme
	'system-theme-changed',
	
	// Settings
	'get-teams-settings',
	'set-teams-settings',

	// Microsoft Graph API integration
	'graph-api-get-user-profile',
	'graph-api-get-calendar-events',
	'graph-api-get-calendar-view',
	'graph-api-create-calendar-event',
	'graph-api-get-mail-messages',
	
	// Error handling
	'unhandled-rejection',
	'window-error',
	
	// Page events
	'page-title',
	'stop-screen-sharing',
]);

/**
 * Validates an IPC channel request
 * @param {string} channel - The IPC channel name
 * @param {any} payload - The payload being sent
 * @returns {boolean} - True if request is valid, false if blocked
 */
export function validateIpcChannel(channel, payload = null) {
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
