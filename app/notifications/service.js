const { Notification, nativeImage, ipcMain } = require("electron");
const path = require("node:path");

/**
 * NotificationService
 *
 * Handles native desktop notifications and notification sounds for Teams for Linux.
 * This service is responsible for:
 * - Displaying native OS notifications with custom icons and urgency levels
 * - Playing notification sounds based on notification type and user status
 * - Managing IPC communication for notification requests from renderer process
 *
 * Dependencies are injected to improve testability and break coupling with global state.
 */
class NotificationService {
  #soundPlayer;
  #config;
  #mainWindow;
  #getUserStatus; // Injected function to get current user status
  #notificationSounds;

  /**
   * Create a NotificationService
   *
   * @param {Object} soundPlayer - Audio player instance (e.g., NodeSound player)
   * @param {Object} config - Application configuration object
   * @param {Object} mainWindow - Main application window instance
   * @param {Function} getUserStatus - Function that returns current user status
   */
  constructor(soundPlayer, config, mainWindow, getUserStatus) {
    this.#soundPlayer = soundPlayer;
    this.#config = config;
    this.#mainWindow = mainWindow;
    this.#getUserStatus = getUserStatus;

    // Initialize notification sounds configuration
    this.#notificationSounds = [
      {
        type: "new-message",
        file: path.join(config.appPath, "assets/sounds/new_message.wav"),
      },
      {
        type: "meeting-started",
        file: path.join(config.appPath, "assets/sounds/meeting_started.wav"),
      },
    ];
  }

  /**
   * Register IPC handlers for notifications
   * Call this method after instantiation to set up IPC communication
   */
  initialize() {
    ipcMain.handle("play-notification-sound", this.#playNotificationSound.bind(this));
    ipcMain.handle("show-notification", this.#showNotification.bind(this));
  }

  /**
   * Show a native desktop notification
   *
   * @private
   * @param {Electron.IpcMainInvokeEvent} _event - IPC event (unused)
   * @param {Object} options - Notification options
   * @param {string} options.title - Notification title
   * @param {string} options.body - Notification body text
   * @param {string} options.icon - Data URL for notification icon
   * @param {string} options.type - Notification type (e.g., "new-message", "meeting-started")
   */
  async #showNotification(_event, options) {
    const startTime = Date.now();
    console.debug("[TRAY_DIAG] Native notification request received", {
      title: options.title,
      bodyLength: options.body?.length || 0,
      hasIcon: !!options.icon,
      type: options.type,
      urgency: this.#config.defaultNotificationUrgency,
      timestamp: new Date().toISOString(),
      suggestion: "Monitor totalTimeMs for notification display delays"
    });

    try {
      // Play notification sound if configured
      this.#playNotificationSound(null, {
        type: options.type,
        audio: "default",
        title: options.title,
        body: options.body,
      });

      // Create and show native notification
      const notification = new Notification({
        icon: nativeImage.createFromDataURL(options.icon),
        title: options.title,
        body: options.body,
        urgency: this.#config.defaultNotificationUrgency,
      });

      notification.on("click", () => {
        console.debug("[TRAY_DIAG] Notification clicked, showing main window");
        this.#mainWindow.show();
      });

      notification.show();

      const totalTime = Date.now() - startTime;
      console.debug("[TRAY_DIAG] Native notification displayed successfully", {
        title: options.title,
        totalTimeMs: totalTime,
        urgency: this.#config.defaultNotificationUrgency,
        performanceNote: totalTime > 500 ? "Slow notification display detected" : "Normal notification speed"
      });

    } catch (error) {
      console.error("[TRAY_DIAG] Failed to show native notification", {
        error: error.message,
        title: options.title,
        elapsedMs: Date.now() - startTime,
        suggestion: "Check if notification permissions are granted or icon data is valid"
      });
    }
  }

  /**
   * Play notification sound based on type and user status
   *
   * Sound playback is controlled by:
   * - Global sound disable setting (config.disableNotificationSound)
   * - User status-based disable (config.disableNotificationSoundIfNotAvailable)
   * - Current user status (injected via getUserStatus function)
   *
   * @private
   * @param {Electron.IpcMainInvokeEvent} _event - IPC event (unused)
   * @param {Object} options - Sound options
   * @param {string} options.type - Notification type to determine which sound to play
   * @param {string} options.audio - Audio setting (e.g., "default")
   * @param {string} options.title - Notification title (for logging)
   * @param {string} options.body - Notification body (for logging)
   */
  async #playNotificationSound(_event, options) {
    console.debug(
      `Notification => Type: ${options.type}, Audio: ${options.audio}, Title: ${options.title}, Body: ${options.body}`
    );

    // Player failed to load or notification sound disabled in config
    if (!this.#soundPlayer || this.#config.disableNotificationSound) {
      console.debug("Notification sounds are disabled");
      return;
    }

    // Get current user status via injected function
    const userStatus = this.#getUserStatus();

    // Notification sound disabled if not available set in config and user status is not "Available" (or is unknown)
    if (
      this.#config.disableNotificationSoundIfNotAvailable &&
      userStatus !== 1 &&
      userStatus !== -1
    ) {
      console.debug("Notification sounds are disabled when user is not active");
      return;
    }

    const sound = this.#notificationSounds.find((ns) => {
      return ns.type === options.type;
    });

    if (sound) {
      console.debug(`Playing file: ${sound.file}`);
      await this.#soundPlayer.play(sound.file);
      return;
    }

    console.debug("No notification sound played", this.#soundPlayer, options);
  }
}

module.exports = NotificationService;
