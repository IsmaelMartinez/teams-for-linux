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

  // Support both new and legacy configuration formats
  // New format: config.shortcuts.enableGlobalShortcuts
  // Legacy format: config.globalShortcuts
  const shortcuts = config.shortcuts?.enableGlobalShortcuts?.length > 0
    ? config.shortcuts.enableGlobalShortcuts
    : config.globalShortcuts || [];

  const prefix = config.shortcuts?.enabledShortcutPrefix
    ? config.shortcuts.enabledShortcutPrefix.trim()
    : (config.globalShortcutPrefix || "").trim();

  if (!Array.isArray(shortcuts) || shortcuts.length === 0) {
    console.debug("[GLOBAL_SHORTCUTS] No global shortcuts configured");
    isRegistered = true; // Mark as registered even with no shortcuts to maintain guard integrity
    return;
  }

  let registeredCount = 0;

  for (const shortcut of shortcuts) {
    // Skip empty or invalid shortcuts
    if (!shortcut || typeof shortcut !== "string") {
      console.debug(`[GLOBAL_SHORTCUTS] Skipping invalid shortcut: ${shortcut}`);
      continue;
    }

    // Apply prefix if configured
    const fullShortcut = prefix ? `${prefix}+${shortcut}` : shortcut;

    try {
      const registered = globalShortcut.register(fullShortcut, () => {
        console.debug(`[GLOBAL_SHORTCUTS] Shortcut triggered: ${fullShortcut}`);

        const window = mainAppWindow.getWindow();
        if (window && !window.isDestroyed()) {
          // Forward the keyboard event to Teams by simulating the key press
          // Teams will handle it with its built-in keyboard shortcuts
          // Note: In practice, sending keyboard events works reliably without focusing the window.
          // If issues arise on specific platforms, consider calling window.focus() before sendInputEvent.
          // We forward the original shortcut (without prefix) to Teams
          sendKeyboardEventToWindow(window, shortcut);
        } else {
          console.warn(`[GLOBAL_SHORTCUTS] Main window not available for shortcut: ${fullShortcut}`);
        }
      });

      if (registered) {
        console.info(`[GLOBAL_SHORTCUTS] Registered: ${fullShortcut}`);
        registeredCount++;
      } else {
        console.warn(`[GLOBAL_SHORTCUTS] Failed to register ${fullShortcut} (may already be in use by another application)`);
      }
    } catch (err) {
      console.error(`[GLOBAL_SHORTCUTS] Error registering ${fullShortcut}: ${err.message}`);
    }
  }

  // Unregister all shortcuts on app quit
  app.on("will-quit", () => {
    globalShortcut.unregisterAll();
    console.debug("[GLOBAL_SHORTCUTS] Unregistered all shortcuts");
    isRegistered = false;
  });

  if (registeredCount > 0) {
    isRegistered = true;
    console.info(`[GLOBAL_SHORTCUTS] Successfully registered ${registeredCount} global shortcut(s)`);
  }
}

module.exports = { register };
