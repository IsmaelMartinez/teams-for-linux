const { ipcMain } = require('electron');
const QuickChatModal = require('./QuickChatModal');

/**
 * Quick Chat Manager
 *
 * Manages the Quick Chat modal lifecycle and coordinates with the main window.
 * Provides quick access to chat contacts using People API and inline messaging via Graph API.
 */
class QuickChatManager {
  #mainWindow;
  #modal;
  #enabled;

  constructor(config, mainWindow) {
    this.#mainWindow = mainWindow;
    this.#enabled = config?.quickChat?.enabled ?? false;
  }

  initialize() {
    if (!this.#enabled) {
      console.info('[QuickChat] Quick Chat feature is disabled');
      return;
    }

    // Create the modal
    this.#modal = new QuickChatModal(this.#mainWindow);

    // Show the Quick Chat modal
    ipcMain.on('quick-chat:show', () => this.show());

    // Hide the Quick Chat modal
    ipcMain.on('quick-chat:hide', () => this.hide());

    console.info('[QuickChat] Initialized');
  }

  /**
   * Show the Quick Chat modal
   */
  show() {
    if (this.#modal) {
      this.#modal.show();
    }
  }

  /**
   * Hide the Quick Chat modal
   */
  hide() {
    if (this.#modal) {
      this.#modal.hide();
    }
  }

  /**
   * Toggle the Quick Chat modal visibility
   */
  toggle() {
    if (this.#modal) {
      this.#modal.toggle();
    }
  }

  /**
   * Check if Quick Chat is enabled
   */
  isEnabled() {
    return this.#enabled;
  }
}

module.exports = QuickChatManager;
