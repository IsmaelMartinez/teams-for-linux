/**
 * MuteToggle Browser Tool
 *
 * Provides functionality to toggle microphone mute/unmute in Microsoft Teams.
 * This tool searches for the mute button in the Teams UI and simulates a click
 * to toggle the microphone state.
 *
 * Works as part of the global shortcuts system - receives IPC messages from
 * the main process when the configured global shortcut is triggered.
 *
 * Configuration:
 * {
 *   "globalShortcuts": {
 *     "toggle-mute": "CommandOrControl+Shift+M"
 *   }
 * }
 */

let _MuteToggle_config = new WeakMap();
let _MuteToggle_initialized = new WeakMap();
let _MuteToggle_ipcRenderer = new WeakMap();

class MuteToggle {
  constructor() {
    _MuteToggle_initialized.set(this, false);
  }

  init(config, ipcRenderer) {
    if (this.initialized) {
      return;
    }
    _MuteToggle_config.set(this, config);
    _MuteToggle_ipcRenderer.set(this, ipcRenderer);
    _MuteToggle_initialized.set(this, true);

    this.#setupIpcListener();
    console.info("[MUTE_TOGGLE] Initialized successfully");
  }

  get config() {
    return _MuteToggle_config.get(this);
  }

  get initialized() {
    return _MuteToggle_initialized.get(this);
  }

  get ipcRenderer() {
    return _MuteToggle_ipcRenderer.get(this);
  }

  #setupIpcListener() {
    const ipcRenderer = this.ipcRenderer;
    if (!ipcRenderer) {
      console.error("[MUTE_TOGGLE] IPC renderer not available");
      return;
    }

    ipcRenderer.on("toggle-mute", () => {
      console.debug("[MUTE_TOGGLE] Received toggle-mute IPC message");
      this.toggleMute();
    });
  }

  /**
   * Attempts to find the Teams mute button using various selectors.
   * Teams UI can change, so we try multiple approaches.
   * @returns {HTMLElement|null} The mute button element or null if not found
   */
  #findMuteButton() {
    // Common selectors for Teams mute button
    const selectors = [
      // New Teams (v2) selectors
      'button[data-tid="toggle-mute"]',
      'button[aria-label*="mute" i]:not([aria-label*="unmute" i])',
      'button[aria-label*="unmute" i]',
      'button[data-tid="microphone-button"]',
      'button[id*="microphone-button"]',
      'button[title*="mute" i]',
      'button[title*="unmute" i]',

      // Classic Teams selectors
      'button[name="toggle-mute"]',
      'button[data-tid="ctrl-toggle-mute"]',

      // Generic fallback - look for buttons with microphone icons
      'button[class*="toggle-button"][class*="audio"]',
      'button[class*="microphone"]',
    ];

    // Try each selector
    for (const selector of selectors) {
      try {
        const button = document.querySelector(selector);
        if (button && this.#isVisibleElement(button)) {
          console.debug(`[MUTE_TOGGLE] Found mute button using selector: ${selector}`);
          return button;
        }
      } catch (err) {
        console.debug(`[MUTE_TOGGLE] Selector failed: ${selector}`, err.message);
      }
    }

    // Try finding in iframe (Teams sometimes loads content in iframe)
    try {
      const iframe = document.querySelector("iframe");
      if (iframe && iframe.contentDocument) {
        for (const selector of selectors) {
          const button = iframe.contentDocument.querySelector(selector);
          if (button && this.#isVisibleElement(button)) {
            console.debug(`[MUTE_TOGGLE] Found mute button in iframe using selector: ${selector}`);
            return button;
          }
        }
      }
    } catch (err) {
      console.debug("[MUTE_TOGGLE] Could not search in iframe:", err.message);
    }

    return null;
  }

  /**
   * Checks if an element is visible and interactable
   * @param {HTMLElement} element - The element to check
   * @returns {boolean} True if element is visible
   */
  #isVisibleElement(element) {
    if (!element) return false;

    const style = globalThis.getComputedStyle(element);
    return style.display !== "none" &&
           style.visibility !== "hidden" &&
           style.opacity !== "0" &&
           element.offsetParent !== null;
  }

  /**
   * Toggles the microphone mute state by clicking the mute button
   */
  toggleMute() {
    console.debug("[MUTE_TOGGLE] Attempting to toggle mute");

    const muteButton = this.#findMuteButton();

    if (!muteButton) {
      console.warn("[MUTE_TOGGLE] Could not find mute button - you may need to be in a call/meeting");
      return;
    }

    try {
      console.debug("[MUTE_TOGGLE] Clicking mute button", {
        tagName: muteButton.tagName,
        ariaLabel: muteButton.getAttribute("aria-label"),
        dataTid: muteButton.getAttribute("data-tid"),
      });

      // Simulate a real click event
      muteButton.click();

      console.info("[MUTE_TOGGLE] Successfully toggled mute");
    } catch (err) {
      console.error("[MUTE_TOGGLE] Failed to click mute button:", err);
    }
  }
}

module.exports = new MuteToggle();
