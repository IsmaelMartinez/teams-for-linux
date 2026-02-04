const { ipcMain } = require('electron');
const QuickChatModal = require('./QuickChatModal');

/**
 * Quick Chat Manager
 *
 * Manages the Quick Chat modal lifecycle and coordinates with the main window.
 * Provides quick access to chat contacts using People API and deep link navigation.
 */
class QuickChatManager {
  #mainWindow;
  #modal;
  #enabled;

  constructor(config, mainWindow) {
    this.#mainWindow = mainWindow;
    this.#enabled = config?.quickChat?.enabled ?? true;
  }

  initialize() {
    if (!this.#enabled) {
      console.info('[QuickChat] Quick Chat feature is disabled');
      return;
    }

    // Create the modal
    this.#modal = new QuickChatModal(this.#mainWindow);

    // Show the Quick Chat modal
    ipcMain.on('quick-chat:show', this.#handleShow.bind(this));

    // Hide the Quick Chat modal
    ipcMain.on('quick-chat:hide', this.#handleHide.bind(this));

    // Open chat with a user via deep link
    ipcMain.on('quick-chat:open-chat', this.#handleOpenChat.bind(this));

    console.info('[QuickChat] Initialized');
  }

  #handleShow() {
    if (this.#modal) {
      this.#modal.show();
    }
  }

  #handleHide() {
    if (this.#modal) {
      this.#modal.hide();
    }
  }

  #handleOpenChat(_event, email) {
    if (!email) {
      console.warn('[QuickChat] No email provided for chat navigation');
      return;
    }

    try {
      // Navigate main window to chat with user via deep link
      // Uses the format: {origin}/l/chat/0/0?users={email}
      if (this.#mainWindow && !this.#mainWindow.isDestroyed()) {
        const currentUrl = this.#mainWindow.webContents.getURL();
        const origin = new URL(currentUrl).origin;
        const chatUrl = `${origin}/l/chat/0/0?users=${encodeURIComponent(email)}`;
        this.#mainWindow.webContents.loadURL(chatUrl);
        console.debug('[QuickChat] Navigating to chat');
      }
    } catch (error) {
      console.error('[QuickChat] Error navigating to chat:', error);
    }
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
