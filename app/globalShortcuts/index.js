import { globalShortcut } from "electron";

/**
 * Register global shortcuts for the application
 * @param {Object} config - Application configuration
 * @param {Object} mainAppWindow - Main application window module
 * @param {Electron.App} app - Electron app instance
 */
export function register(config, mainAppWindow, app) {
	if (!Array.isArray(config.globalShortcuts) || config.globalShortcuts.length === 0) {
		console.debug("[SHORTCUTS] No global shortcuts configured");
		return;
	}

	for (const shortcutConfig of config.globalShortcuts) {
		if (!shortcutConfig.key || !shortcutConfig.action) {
			console.warn("[SHORTCUTS] Invalid shortcut config:", shortcutConfig);
			continue;
		}

		try {
			const registered = globalShortcut.register(shortcutConfig.key, () => {
				handleShortcutAction(shortcutConfig.action, mainAppWindow, app);
			});

			if (registered) {
				console.debug(`[SHORTCUTS] Registered global shortcut: ${shortcutConfig.key} -> ${shortcutConfig.action}`);
			} else {
				console.warn(`[SHORTCUTS] Failed to register shortcut: ${shortcutConfig.key}`);
			}
		} catch (error) {
			console.error(`[SHORTCUTS] Error registering shortcut ${shortcutConfig.key}:`, error);
		}
	}
}

/**
 * Handle a shortcut action
 * @param {string} action - The action to perform
 * @param {Object} mainAppWindow - Main application window module
 * @param {Electron.App} app - Electron app instance
 */
function handleShortcutAction(action, mainAppWindow, app) {
	const window = mainAppWindow.getWindow();

	switch (action) {
	case "show-window":
		if (window) {
			if (window.isMinimized()) {
				window.restore();
			}
			window.show();
			window.focus();
		}
		break;

	case "hide-window":
		if (window) {
			window.hide();
		}
		break;

	case "toggle-window":
		if (window) {
			if (window.isVisible()) {
				window.hide();
			} else {
				if (window.isMinimized()) {
					window.restore();
				}
				window.show();
				window.focus();
			}
		}
		break;

	case "quit":
		app.quit();
		break;

	default:
		console.warn(`[SHORTCUTS] Unknown action: ${action}`);
	}
}

/**
 * Send a keyboard event to a window
 * @param {BrowserWindow} window - Target window
 * @param {string} shortcut - Keyboard shortcut (e.g., "Ctrl+Shift+M")
 */
export function sendKeyboardEventToWindow(window, shortcut) {
	if (!window || window.isDestroyed()) {
		return;
	}

	const webContents = window.webContents;
	const parts = shortcut.split("+");
	const key = parts[parts.length - 1].toLowerCase();
	const modifiers = parts.slice(0, -1).map(m => m.toLowerCase());

	const keyEvent = {
		type: "keyDown",
		keyCode: key,
		modifiers: modifiers,
	};

	webContents.sendInputEvent(keyEvent);

	// Send keyUp after a short delay
	setTimeout(() => {
		webContents.sendInputEvent({
			...keyEvent,
			type: "keyUp",
		});
	}, 50);
}

/**
 * Unregister all global shortcuts
 */
export function unregisterAll() {
	globalShortcut.unregisterAll();
}
