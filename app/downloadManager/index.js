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

    const filename = item.getFilename();
    console.debug(`[DownloadManager] Download started: ${filename}`);

    item.once("done", (_doneEvent, state) => {
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
    const downloadConfig = this.#config?.download;
    if (downloadConfig && downloadConfig.notifyOnDownloadComplete === false) {
      return false;
    }
    return true;
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
      notification.show();
    } catch (error) {
      console.error("[DownloadManager] Failed to show failure notification", {
        message: error.message,
      });
    }
  }
}

module.exports = DownloadManager;
