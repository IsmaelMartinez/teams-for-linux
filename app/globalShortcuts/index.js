/**
 * Global Shortcuts Module
 *
 * Registers system-wide keyboard shortcuts that forward events to Teams.
 * This allows Teams' built-in shortcuts to work even when the app is not focused.
 */

const { globalShortcut } = require("electron");
const os = require("node:os");

const isMac = os.platform() === "darwin";
let isRegistered = false;

/**
 * Parses an Electron accelerator string into key and modifiers.
 *
 * @param {string} accelerator - The accelerator string (e.g., "Control+Shift+M")
 * @returns {Object} - Object with key and modifiers array
 */
function parseAccelerator(accelerator) {
  const parts = accelerator.split("+");
  const modifiers = [];
  let key = "";

  for (const part of parts) {
    const lower = part.toLowerCase();
    if (lower === "commandorcontrol" || lower === "cmdorctrl") {
      modifiers.push(isMac ? "cmd" : "control");
    } else if (lower === "command" || lower === "cmd") {
      modifiers.push("cmd");
    } else if (lower === "control" || lower === "ctrl") {
      modifiers.push("control");
    } else if (lower === "shift") {
      modifiers.push("shift");
    } else if (lower === "alt" || lower === "option") {
      modifiers.push("alt");
    } else if (lower === "super" || lower === "meta") {
      modifiers.push("super");
    } else {
      // This is the key
      key = part;
    }
  }

  return { key, modifiers };
}

/**
 * Sends a keyboard event to the window's webContents.
 * Parses the accelerator string and simulates the corresponding key press.
 *
 * @param {BrowserWindow} window - The window to send the event to
 * @param {string} accelerator - The accelerator string (e.g., "Control+Shift+M")
 */
function sendKeyboardEventToWindow(window, accelerator) {
  try {
    // Parse the accelerator string
    const parsed = parseAccelerator(accelerator);

    // Send keyDown event
    window.webContents.sendInputEvent({
      type: "keyDown",
      keyCode: parsed.key,
      modifiers: parsed.modifiers
    });

    // Send keyUp event
    window.webContents.sendInputEvent({
      type: "keyUp",
      keyCode: parsed.key,
      modifiers: parsed.modifiers
    });

    console.debug(`[GLOBAL_SHORTCUTS] Forwarded keyboard event: ${accelerator}`);
  } catch (err) {
    console.error(`[GLOBAL_SHORTCUTS] Error sending keyboard event for ${accelerator}: ${err.message}`);
  }
}

/**
 * Gets the shortcuts array from config, supporting both new and legacy formats.
 * @param {Object} config - Application configuration
 * @returns {Array} Array of shortcuts
 */
function getShortcutsFromConfig(config) {
  // New format: config.shortcuts.enableGlobalShortcuts
  // Legacy format: config.globalShortcuts
  if (config.shortcuts?.enableGlobalShortcuts?.length > 0) {
    return config.shortcuts.enableGlobalShortcuts;
  }
  return config.globalShortcuts || [];
}

/**
 * Gets the prefix from config, supporting both new and legacy formats.
 * @param {Object} config - Application configuration
 * @returns {string} Prefix string (may be empty)
 */
function getPrefixFromConfig(config) {
  // New format: config.shortcuts.enabledShortcutPrefix
  // Legacy format: config.globalShortcutPrefix
  // Use !== undefined to allow explicit empty string "" (no prefix)
  if (config.shortcuts?.enabledShortcutPrefix !== undefined) {
    return config.shortcuts.enabledShortcutPrefix.trim();
  }

  const legacyPrefix = config.globalShortcutPrefix;
  if (legacyPrefix && legacyPrefix.trim()) {
    return legacyPrefix.trim();
  }

  return "";
}

/**
 * Registers a single global shortcut.
 * @param {string} shortcut - The shortcut to register
 * @param {string} prefix - Optional prefix to prepend
 * @param {Object} mainAppWindow - Main application window module
 * @returns {boolean} True if registration succeeded
 */
function registerSingleShortcut(shortcut, prefix, mainAppWindow) {
  const fullShortcut = prefix ? `${prefix}+${shortcut}` : shortcut;

  try {
    const registered = globalShortcut.register(fullShortcut, () => {
      console.debug(`[GLOBAL_SHORTCUTS] Shortcut triggered: ${fullShortcut}`);

      const window = mainAppWindow.getWindow();
      if (window && !window.isDestroyed()) {
        // Forward the keyboard event to Teams by simulating the key press
        // Teams will handle it with its built-in keyboard shortcuts
        sendKeyboardEventToWindow(window, shortcut);
      } else {
        console.warn(`[GLOBAL_SHORTCUTS] Main window not available for shortcut: ${fullShortcut}`);
      }
    });

    if (registered) {
      console.info(`[GLOBAL_SHORTCUTS] Registered: ${fullShortcut}`);
      return true;
    }

    console.warn(`[GLOBAL_SHORTCUTS] Failed to register ${fullShortcut} (may already be in use by another application)`);
    return false;
  } catch (err) {
    console.error(`[GLOBAL_SHORTCUTS] Error registering ${fullShortcut}: ${err.message}`);
    return false;
  }
}

/**
 * Registers global shortcuts that forward keyboard events to Teams.
 *
 * @param {Object} config - Application configuration
 * @param {Object} mainAppWindow - Main application window module
 * @param {Object} app - Electron app instance
 */
function register(config, mainAppWindow, app) {
  // Guard against multiple registrations
  if (isRegistered) {
    console.debug("[GLOBAL_SHORTCUTS] Already registered, skipping");
    return;
  }

  const shortcuts = getShortcutsFromConfig(config);
  const hasShortcuts = Array.isArray(shortcuts) && shortcuts.length > 0;

  if (hasShortcuts) {
    const prefix = getPrefixFromConfig(config);
    let registeredCount = 0;

    for (const shortcut of shortcuts) {
      // Skip empty or invalid shortcuts
      if (shortcut && typeof shortcut === "string") {
        if (registerSingleShortcut(shortcut, prefix, mainAppWindow)) {
          registeredCount++;
        }
      } else {
        console.debug(`[GLOBAL_SHORTCUTS] Skipping invalid shortcut: ${shortcut}`);
      }
    }

    if (registeredCount > 0) {
      isRegistered = true;
      console.info(`[GLOBAL_SHORTCUTS] Successfully registered ${registeredCount} global shortcut(s)`);
    }
  } else {
    console.debug("[GLOBAL_SHORTCUTS] No global shortcuts configured");
  }

  // Mark as registered even with no shortcuts to maintain guard integrity
  isRegistered = true;

  // Unregister all shortcuts on app quit
  app.on("will-quit", () => {
    globalShortcut.unregisterAll();
    console.debug("[GLOBAL_SHORTCUTS] Unregistered all shortcuts");
    isRegistered = false;
  });
}

module.exports = { register };
