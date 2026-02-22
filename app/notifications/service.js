const { Notification, nativeImage, ipcMain } = require("electron");
const path = require("node:path");
const fs = require("node:fs");

const USER_STATUS = {
  UNKNOWN: -1,
  AVAILABLE: 1,
};

class NotificationService {
  #config;
  #mainWindow;
  #getUserStatus;
  #notificationSounds;

  constructor(config, mainWindow, getUserStatus) {
    this.#config = config;
    this.#mainWindow = mainWindow;
    this.#getUserStatus = getUserStatus;

    // Pre-load WAV files as base64 data URIs so the renderer can play them
    // directly with new Audio(dataUri).play() — no file I/O in the renderer,
    // no Blob URLs, no AudioContext suspension issues.
    this.#notificationSounds = [];
    for (const { type, file } of [
      { type: "new-message", file: "new_message.wav" },
      { type: "meeting-started", file: "meeting_started.wav" },
    ]) {
      try {
        const filePath = path.join(config.appPath, "assets", "sounds", file);
        const data = fs.readFileSync(filePath);
        this.#notificationSounds.push({ type, dataUri: `data:audio/wav;base64,${data.toString("base64")}` });
      } catch {
        console.warn(`[NOTIFICATION] Could not load sound file: ${file}`);
      }
    }
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

  // Returns a base64 data URI for the renderer to play via new Audio(dataUri).play(),
  // or null if sound is disabled by config or user status.
  #playNotificationSound(options) {
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

    const sound = this.#notificationSounds.find((s) => s.type === options.type);
    return sound ? sound.dataUri : null;
  }
}

module.exports = NotificationService;
