/**
 * IPC Channel Validator
 * Provides security validation for all IPC communications
 */

// Allowlist of valid IPC channels
export const allowedChannels = new Set([
	// Core application
	"config-file-changed",
	"get-config",
	"get-app-version",
	"user-status-changed",
	"set-badge-count",
	
	// Navigation
	"navigate-back",
	"navigate-forward",
	"get-navigation-state",
	"navigation-state-changed",
	
	// Notifications
	"show-notification",
	"play-notification-sound",
	"notification-show-toast",
	"notification-close-toast",
	"notification-toast-clicked",
	"notification-data",
	
	// Screen sharing
	"screen-sharing-started",
	"screen-sharing-stopped",
	"stop-screen-sharing-from-thumbnail",
	"get-screen-sharing-preview-source",
	"choose-desktop-media",
	"cancel-desktop-media",
	"selected-source",
	"close-view",
	"select-source",
	"stop-screen-sharing",
	
	// Partitions/Zoom
	"get-zoom-level",
	"save-zoom-level",
	
	// Idle monitoring
	"get-idle-time",
	"is-system-idle",
	"system-idle-changed",
	
	// Tray
	"tray-update",
	
	// Theme
	"system-theme-changed",
	
	// Settings
	"get-teams-settings",
	"set-teams-settings",
	"config-changed",
	
	// Custom background
	"get-custom-bg-list",
	
	// Login
	"submitForm",
	
	// Graph API
	"graph-api-get-user-profile",
	"graph-api-get-calendar-events",
	"graph-api-get-calendar-view",
	"graph-api-create-calendar-event",
	"graph-api-get-mail-messages",
	
	// Error handling
	"unhandled-rejection",
	"window-error",
	
	// Page events
	"page-title",
	
	// Incoming call
	"incoming-call-toast-clicked",
]);

/**
 * Validate if an IPC channel is allowed
 * @param {string} channel - The IPC channel name
 * @param {any} _data - Optional data (for future validation)
 * @returns {boolean} Whether the channel is allowed
 */
export function validateIpcChannel(channel, _data = null) {
	const isAllowed = allowedChannels.has(channel);
	
	if (!isAllowed) {
		console.warn(`[IPC Security] Unknown channel attempted: ${channel}`);
	}
	
	return isAllowed;
}
