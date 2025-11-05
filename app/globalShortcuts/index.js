/**
 * Global Shortcuts Module
 *
 * Registers system-wide keyboard shortcuts that forward events to Teams.
 * This allows Teams' built-in shortcuts to work even when the app is not focused.
 */

const { globalShortcut } = require("electron");
const os = require("node:os");

const isMac = os.platform() === "darwin";

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
  if (!Array.isArray(config.globalShortcuts) || config.globalShortcuts.length === 0) {
    console.debug("[GLOBAL_SHORTCUTS] No global shortcuts configured");
    return;
  }

  const registeredShortcuts = [];

  for (const shortcut of config.globalShortcuts) {
    // Skip empty or invalid shortcuts
    if (!shortcut || typeof shortcut !== "string") {
      console.debug(`[GLOBAL_SHORTCUTS] Skipping invalid shortcut: ${shortcut}`);
      continue;
    }

    try {
      const registered = globalShortcut.register(shortcut, () => {
        console.debug(`[GLOBAL_SHORTCUTS] Shortcut triggered: ${shortcut}`);

        const window = mainAppWindow.getWindow();
        if (window && !window.isDestroyed()) {
          // Forward the keyboard event to Teams by simulating the key press
          // Teams will handle it with its built-in keyboard shortcuts
          // Note: Electron docs suggest window.focus() is required for sendInputEvent,
          // but we're testing if it works without bringing window to front
          sendKeyboardEventToWindow(window, shortcut);
        } else {
          console.warn(`[GLOBAL_SHORTCUTS] Main window not available for shortcut: ${shortcut}`);
        }
      });

      if (registered) {
        console.info(`[GLOBAL_SHORTCUTS] Registered: ${shortcut}`);
        registeredShortcuts.push(shortcut);
      } else {
        console.warn(`[GLOBAL_SHORTCUTS] Failed to register ${shortcut} (may already be in use by another application)`);
      }
    } catch (err) {
      console.error(`[GLOBAL_SHORTCUTS] Error registering ${shortcut}: ${err.message}`);
    }
  }

  // Unregister all shortcuts on app quit
  app.on("will-quit", () => {
    for (const shortcut of registeredShortcuts) {
      try {
        globalShortcut.unregister(shortcut);
        console.debug(`[GLOBAL_SHORTCUTS] Unregistered: ${shortcut}`);
      } catch (err) {
        console.error(`[GLOBAL_SHORTCUTS] Error unregistering ${shortcut}: ${err.message}`);
      }
    }
  });

  if (registeredShortcuts.length > 0) {
    console.info(`[GLOBAL_SHORTCUTS] Successfully registered ${registeredShortcuts.length} global shortcut(s)`);
  }
}

module.exports = { register };
