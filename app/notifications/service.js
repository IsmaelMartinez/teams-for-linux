const { Notification, nativeImage, ipcMain } = require("electron");

const USER_STATUS = {
  UNKNOWN: -1,
  AVAILABLE: 1,
};

class NotificationService {
  #config;
  #mainWindow;
  #getUserStatus;

  constructor(config, mainWindow, getUserStatus) {
    this.#config = config;
    this.#mainWindow = mainWindow;
    this.#getUserStatus = getUserStatus;
  }

  initialize() {
    // Play notification sound for Teams messages and calls
    ipcMain.handle("play-notification-sound", this.#handlePlayNotificationSound.bind(this));
    // Show system notification for Teams activity
    ipcMain.handle("show-notification", this.#handleShowNotification.bind(this));
  }

  async #handleShowNotification(_event, options) {
    return this.#showNotification(options);
  }

  async #handlePlayNotificationSound(_event, options) {
    return this.#playNotificationSound(options);
  }

  async #showNotification(options) {
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
      // Create notification config
      const notificationConfig = {
        title: options.title,
        body: options.body,
        urgency: this.#config.defaultNotificationUrgency,
      };

      // Only add icon if provided to avoid errors with null/undefined
      if (options.icon) {
        notificationConfig.icon = nativeImage.createFromDataURL(options.icon);
      }

      // Create and show native notification
      const notification = new Notification(notificationConfig);

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

  // Returns true if the renderer should play a notification sound, null otherwise
  #playNotificationSound(_options) {
    if (this.#config.disableNotificationSound) {
      console.debug("[NOTIFICATION] Sounds disabled");
      return null;
    }

    const userStatus = this.#getUserStatus();

    if (
      this.#config.disableNotificationSoundIfNotAvailable &&
      userStatus !== USER_STATUS.AVAILABLE &&
      userStatus !== USER_STATUS.UNKNOWN
    ) {
      console.debug("[NOTIFICATION] Sound disabled for non-available status");
      return null;
    }

    return true;
  }
}

module.exports = NotificationService;
