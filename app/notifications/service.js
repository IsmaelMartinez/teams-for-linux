const { Notification, nativeImage, ipcMain } = require("electron");
const crypto = require("node:crypto");
const path = require("node:path");

const ICON_FETCH_TIMEOUT_MS = 3000;
const MAX_ICON_BYTES = 5 * 1024 * 1024;

const USER_STATUS = {
  UNKNOWN: -1,
  AVAILABLE: 1,
};

class NotificationService {
  #soundPlayer;
  #config;
  #mainWindow;
  #getUserStatus;
  #notificationSounds;

  constructor(soundPlayer, config, mainWindow, getUserStatus) {
    this.#soundPlayer = soundPlayer;
    this.#config = config;
    this.#mainWindow = mainWindow;
    this.#getUserStatus = getUserStatus;

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

  initialize() {
    // Play notification sound for Teams messages and calls
    ipcMain.handle("play-notification-sound", this.#handlePlayNotificationSound.bind(this));
    // Show system notification for Teams activity
    ipcMain.handle("show-notification", this.#handleShowNotification.bind(this));
  }

  async #handleShowNotification(_event, options) {
    const notificationId = options?.notificationId || crypto.randomUUID();
    return this.#showNotification({ ...options, notificationId });
  }

  async #handlePlayNotificationSound(_event, options) {
    return this.#playNotificationSound(options);
  }

  async #showNotification(options) {
    const startTime = Date.now();
    console.debug("[NOTIFICATIONS] Native notification request received", {
      title: options.title,
      bodyLength: options.body?.length || 0,
      hasIcon: !!options.icon,
      type: options.type,
      urgency: this.#config.defaultNotificationUrgency,
      timestamp: new Date().toISOString(),
      suggestion: "Monitor totalTimeMs for notification display delays"
    });

    try {
      // Play notification sound if configured (await to catch any errors)
      await this.#playNotificationSound({
        type: options.type,
        audio: "default",
        title: options.title,
        body: options.body,
      });

      const notificationConfig = {
        title: options.title,
        body: options.body,
        urgency: this.#config.defaultNotificationUrgency,
        timeoutType: options.timeoutType === "never" ? "never" : "default",
      };

      const icon = await this.#loadIcon(options.icon);
      if (icon) notificationConfig.icon = icon;

      const notification = new Notification(notificationConfig);

      notification.on("click", () => {
        // notifications.electron.clickAction controls window behaviour on click
        // (issue #2647). Defaults to "show" so existing behaviour is unchanged.
        const clickAction = this.#config.notifications?.electron?.clickAction ?? "show";
        console.debug(`[NOTIFICATIONS] Notification clicked, clickAction=${clickAction}`);
        if (clickAction === "none") return;
        if (clickAction === "restore") {
          // restore if minimised, show if in the tray, then focus. Whether the
          // focus is honoured is window-manager dependent on Linux.
          this.#mainWindow.restoreWindow();
        } else {
          this.#mainWindow.show();
        }
      });

      notification.on("close", () => {
        console.debug("[NOTIFICATIONS] Notification dismissed by system");
        const win = this.#mainWindow.getWindow();
        if (!win || win.isDestroyed()) return;
        const { webContents } = win;
        if (!webContents || webContents.isDestroyed()) return;
        webContents.send("notification-closed", options.notificationId);
      });

      notification.show();

      const totalTime = Date.now() - startTime;
      console.debug("[NOTIFICATIONS] Native notification displayed successfully", {
        title: options.title,
        totalTimeMs: totalTime,
        urgency: this.#config.defaultNotificationUrgency,
        performanceNote: totalTime > 500 ? "Slow notification display detected" : "Normal notification speed"
      });

    } catch (error) {
      console.error("[NOTIFICATIONS] Failed to show native notification", {
        error: error.message,
        title: options.title,
        elapsedMs: Date.now() - startTime,
        suggestion: "Check if notification permissions are granted or icon data is valid"
      });
    }
  }

  async #loadIcon(icon) {
    if (typeof icon !== "string" || !icon) return null;

    if (icon.startsWith("data:")) {
      const image = nativeImage.createFromDataURL(icon);
      return image.isEmpty() ? null : image;
    }

    let url;
    try {
      url = new URL(icon);
    } catch {
      return null;
    }
    if (url.protocol !== "https:") return null;

    const win = this.#mainWindow.getWindow();
    const session = win?.webContents?.session;
    if (!session?.fetch) return null;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ICON_FETCH_TIMEOUT_MS);
    try {
      const response = await session.fetch(url.href, {
        credentials: "include",
        signal: controller.signal,
      });
      if (!response.ok) return null;

      let responseUrl;
      try {
        responseUrl = new URL(response.url);
      } catch {
        return null;
      }
      if (responseUrl.protocol !== "https:") return null;

      const declaredSize = Number(response.headers.get("content-length"));
      if (declaredSize > MAX_ICON_BYTES) return null;

      const reader = response.body?.getReader();
      if (!reader) return null;

      const chunks = [];
      let size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_ICON_BYTES) {
          await reader.cancel();
          return null;
        }
        chunks.push(Buffer.from(value));
      }

      const image = nativeImage.createFromBuffer(Buffer.concat(chunks, size));
      return image.isEmpty() ? null : image;
    } catch {
      console.warn("[NOTIFICATIONS] Could not load remote notification icon");
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  async #playNotificationSound(options) {
    console.debug(
      `Notification => Type: ${options.type}, Audio: ${options.audio}, Title: ${options.title}, Body: ${options.body}`
    );

    // Player failed to load or notification sound disabled in config
    if (!this.#soundPlayer || this.#config.disableNotificationSound) {
      console.debug("Notification sounds are disabled");
      return;
    }

    const userStatus = this.#getUserStatus();

    // Notification sound disabled if not available set in config and user status is not "Available" (or is unknown)
    if (
      this.#config.disableNotificationSoundIfNotAvailable &&
      userStatus !== USER_STATUS.AVAILABLE &&
      userStatus !== USER_STATUS.UNKNOWN
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
