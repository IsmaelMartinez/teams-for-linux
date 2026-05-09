const { Notification, shell } = require("electron");

// Matches the leading progress prefix this manager applies to window titles
// (e.g. `[34%] ` or `[downloading] `). Anchored to the start so we only strip
// our own prefix and never touch a legitimate page title that happens to
// contain bracketed numbers later in the string.
const TITLE_PREFIX_RE = /^\[(\d{1,3}%|downloading)\]\s/;

function stripDownloadPrefix(title) {
  return title.replace(TITLE_PREFIX_RE, "");
}

/**
 * DownloadManager surfaces Electron `DownloadItem` lifecycle as user-visible
 * feedback. Without a `will-download` handler, Electron silently saves files
 * to the default download directory with no progress UI, so a Teams download
 * looks like nothing happened (issue #2512).
 *
 * Scope:
 *   - Taskbar progress bar via `BrowserWindow.setProgressBar`, aggregated
 *     across concurrent downloads. Indeterminate mode kicks in when the
 *     server doesn't advertise a content length.
 *   - Window-title fallback: a `[34%] ` (or `[downloading] `) prefix on the
 *     window title. Linux distros without `libunity` (Debian, Fedora, Arch,
 *     KDE/GNOME by default) get nothing from `setProgressBar` because
 *     Electron loads libunity via `dlopen` at runtime; the title prefix is
 *     a portable fallback that every WM/DE renders in its taskbar tooltip
 *     or window list.
 *   - System notification on completion; click opens the containing folder
 *     via `shell.showItemInFolder()`.
 *   - System notification on cancellation / interruption.
 *
 * Richer UI (in-app downloads list, per-item tray badge) is out of scope.
 */
class DownloadManager {
  #config;
  #mainAppWindow;
  #session = null;
  // Hold strong references to live `Notification` instances so the V8 garbage
  // collector doesn't reap them — and their click/close listeners — between
  // `show()` and the user actually interacting with the toast. Entries are
  // removed on `click` or `close`.
  #activeNotifications = new Set();
  // Active downloads tracked for the taskbar progress bar. Removed in `done`.
  #activeItems = new Set();

  constructor(config, mainAppWindow) {
    this.#config = config;
    this.#mainAppWindow = mainAppWindow;
  }

  /**
   * Attach a `will-download` listener to the supplied session. Idempotent: if
   * called more than once on the same session the second call is a no-op.
   *
   * Gated by `config.download.enabled` (default `false`) — the maintainer
   * wants this feature opt-in while it's still in early development. The
   * sub-flags (`notifyOnDownloadComplete`, etc.) keep their `true` defaults
   * but only matter once the master switch is on. Graduating to opt-out
   * later is a one-line default flip.
   *
   * @param {Electron.Session} targetSession - The session to observe.
   */
  initialize(targetSession) {
    if (!this.#config?.download?.enabled) {
      console.debug("[DownloadManager] Disabled (config.download.enabled is not true)");
      return;
    }
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
    const notify = this.#shouldNotify();
    const showProgress = this.#shouldShowProgress();
    if (!notify && !showProgress) return;

    console.debug(`[DownloadManager] Download started: ${item.getFilename()}`);

    let onUpdated = null;
    if (showProgress) {
      this.#activeItems.add(item);
      onUpdated = () => this.#updateProgressBar();
      item.on("updated", onUpdated);
      this.#updateProgressBar();
    }

    item.once("done", (_doneEvent, state) => {
      if (showProgress) {
        // Explicitly drop the `updated` listener so we don't keep references
        // to the item (or its closures) past completion, even if the
        // DownloadItem outlives the manager's tracking set.
        if (onUpdated) item.removeListener("updated", onUpdated);
        this.#activeItems.delete(item);
        this.#updateProgressBar();
      }
      if (!notify) return;

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
    if (this.#config?.download?.notifyOnDownloadComplete === false) {
      return false;
    }
    return true;
  }

  #shouldShowProgress() {
    return this.#config?.download?.showProgressBar !== false;
  }

  /**
   * Recompute the taskbar progress bar from the active-downloads set:
   *
   * - No active downloads: clear (`setProgressBar(-1)`).
   * - Any item without a known total size: indeterminate mode, so the user
   *   still sees motion on the taskbar.
   * - Otherwise: byte-weighted average across all active items so a single
   *   bar represents the whole batch.
   */
  #updateProgressBar() {
    const window = this.#mainAppWindow?.getWindow?.();
    if (!window || window.isDestroyed()) return;

    if (this.#activeItems.size === 0) {
      window.setProgressBar(-1);
      this.#clearTitlePrefix(window);
      return;
    }

    let knownTotal = 0;
    let knownReceived = 0;
    let hasUnknownTotal = false;
    for (const item of this.#activeItems) {
      const total = item.getTotalBytes?.() ?? 0;
      const received = item.getReceivedBytes?.() ?? 0;
      if (!total || total <= 0) {
        hasUnknownTotal = true;
        continue;
      }
      knownTotal += total;
      knownReceived += received;
    }

    if (hasUnknownTotal || knownTotal <= 0) {
      window.setProgressBar(2, { mode: "indeterminate" });
      this.#applyTitlePrefix(window, null);
      return;
    }

    const fraction = Math.max(0, Math.min(1, knownReceived / knownTotal));
    window.setProgressBar(fraction);
    this.#applyTitlePrefix(window, fraction);
  }

  /**
   * Update the window title with a progress prefix, keeping a fallback path
   * for environments where Electron's `setProgressBar` is a no-op (Linux
   * without `libunity` — Debian, Fedora, Arch, etc. by default).
   *
   * The title flow on Linux looks like:
   *   1. Teams DOM updates `document.title` -> Chromium fires
   *      `page-title-updated`, which we don't preventDefault on, so the
   *      window title gets set to the new page title (overwriting our
   *      prefix).
   *   2. The next `DownloadItem.on('updated')` fires (~500ms cadence) and
   *      re-applies the prefix here.
   *
   * The brief no-prefix window between (1) and (2) is acceptable; the upside
   * is no need to listen to `page-title-updated` and risk fighting the
   * existing title pipeline.
   *
   * @param {Electron.BrowserWindow} window
   * @param {number|null} fraction - 0..1, or null for indeterminate.
   */
  #applyTitlePrefix(window, fraction) {
    const currentTitle = window.getTitle();
    const baseTitle = stripDownloadPrefix(currentTitle);
    const prefix = fraction === null
      ? "[downloading] "
      : `[${Math.round(fraction * 100)}%] `;
    const next = prefix + baseTitle;
    if (next !== currentTitle) {
      window.setTitle(next);
    }
  }

  /**
   * Reset the window title to its un-prefixed form once no downloads remain.
   *
   * @param {Electron.BrowserWindow} window
   */
  #clearTitlePrefix(window) {
    const currentTitle = window.getTitle();
    const baseTitle = stripDownloadPrefix(currentTitle);
    if (baseTitle !== currentTitle) {
      window.setTitle(baseTitle);
    }
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
