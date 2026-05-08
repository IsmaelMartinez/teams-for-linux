const { Notification, shell } = require("electron");

/**
 * DownloadManager surfaces Electron `DownloadItem` lifecycle as user-visible
 * feedback. Without a `will-download` handler, Electron silently saves files
 * to the default download directory with no progress UI, so a Teams download
 * looks like nothing happened (issue #2512).
 *
 * Scope: a system notification on completion, click opens the containing
 * folder via `shell.showItemInFolder()`. A separate notification is shown if
 * the download is cancelled or interrupted so users know it didn't finish.
 *
 * Per-item progress UI (in-app downloads list, tray badge while active) is
 * intentionally out of scope here; it can be layered on later if requested.
 */
class DownloadManager {
  #config;
  #session = null;
  // Hold strong references to live `Notification` instances so the V8 garbage
  // collector doesn't reap them — and their click/close listeners — between
  // `show()` and the user actually interacting with the toast. Entries are
  // removed on `click` or `close`.
  #activeNotifications = new Set();

  constructor(config) {
    this.#config = config;
  }

  /**
   * Attach a `will-download` listener to the supplied session. Idempotent: if
   * called more than once on the same session the second call is a no-op.
   *
   * @param {Electron.Session} targetSession - The session to observe.
   */
  initialize(targetSession) {
    if (!targetSession) {
      console.warn("[DownloadManager] No session provided; download notifications disabled");
      return;
    }
    if (this.#session) {
      return;
    }
    this.#session = targetSession;
    targetSession.on("will-download", this.#onWillDownload.bind(this));
  }

  #onWillDownload(_event, item) {
    if (!this.#shouldNotify()) return;

    console.debug(`[DownloadManager] Download started: ${item.getFilename()}`);

    item.once("done", (_doneEvent, state) => {
      // Read filename from the item inside `done` rather than capturing it at
      // start: if the item is renamed mid-flight (e.g. via a `Save As` dialog
      // attached by another handler) the final name is what the user will see
      // on disk, so notify with that.
      const filename = item.getFilename();
      const savePath = item.getSavePath();
      switch (state) {
        case "completed":
          this.#notifyCompleted(filename, savePath);
          break;
        case "cancelled":
          console.debug(`[DownloadManager] Download cancelled: ${filename}`);
          this.#notifyFailed(filename, "Download cancelled");
          break;
        case "interrupted":
          console.warn(`[DownloadManager] Download interrupted: ${filename}`);
          this.#notifyFailed(filename, "Download interrupted");
          break;
        default:
          console.warn(`[DownloadManager] Download finished with unknown state: ${state}`);
      }
    });
  }

  #shouldNotify() {
    // `disableNotifications` is the global "no toasts at all" switch. Honour
    // it here so the download toast respects the same kill-switch as Teams
    // chat / meeting notifications.
    if (this.#config?.disableNotifications) {
      return false;
    }
    const downloadConfig = this.#config?.download;
    if (downloadConfig && downloadConfig.notifyOnDownloadComplete === false) {
      return false;
    }
    return true;
  }

  /**
   * Wire common lifecycle handlers on a notification so it cannot be GC'd
   * before the user dismisses or clicks it, and clean up the strong reference
   * once that happens.
   *
   * @param {Electron.Notification} notification
   */
  #trackNotification(notification) {
    this.#activeNotifications.add(notification);
    const release = () => {
      this.#activeNotifications.delete(notification);
      notification.removeListener("close", release);
      notification.removeListener("click", release);
    };
    notification.on("close", release);
    notification.on("click", release);
  }

  #notifyCompleted(filename, savePath) {
    console.debug(`[DownloadManager] Download completed: ${filename}`);
    try {
      const notification = new Notification({
        title: "Download complete",
        body: `${filename} — click to show in folder`,
      });
      notification.on("click", () => {
        if (savePath) {
          shell.showItemInFolder(savePath);
        }
      });
      this.#trackNotification(notification);
      notification.show();
    } catch (error) {
      console.error("[DownloadManager] Failed to show completion notification", {
        message: error.message,
      });
    }
  }

  #notifyFailed(filename, reason) {
    try {
      const notification = new Notification({
        title: "Download did not finish",
        body: `${filename} — ${reason}`,
      });
      this.#trackNotification(notification);
      notification.show();
    } catch (error) {
      console.error("[DownloadManager] Failed to show failure notification", {
        message: error.message,
      });
    }
  }
}

module.exports = DownloadManager;
