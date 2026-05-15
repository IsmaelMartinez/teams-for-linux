const { Notification, shell } = require("electron");

// Matches the leading progress prefix this manager applies to window titles
// (e.g. `[34%] `, `[34%, 78%] `, `[downloading] `, `[50%, downloading] `).
// Anchored to the start so we only strip our own prefix and never touch a
// legitimate page title that happens to contain bracketed numbers later in
// the string. Each part is either `\d{1,3}%` or `downloading`, separated by
// a comma + optional space, the whole group wrapped in `[…] ` plus a
// trailing space.
const TITLE_PREFIX_PART = /(?:\d{1,3}%|downloading)/;
const TITLE_PREFIX_RE = new RegExp(
  String.raw`^\[${TITLE_PREFIX_PART.source}(?:,\s*${TITLE_PREFIX_PART.source})*\]\s`,
);

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
 *   - KDE / freedesktop JobView (per-item progress in Plasma's notification
 *     widget — the same place users see Firefox / Dolphin / KIO download
 *     progress). Driven via `org.kde.JobViewServer` if available; degrades
 *     to no-op on systems without it.
 *   - Window-title fallback: a `[34%] ` (or `[downloading] `) prefix on the
 *     window title. Electron's `setProgressBar` is a no-op on most Linux
 *     setups (Unity launcher protocol gated on `com.canonical.Unity` name
 *     ownership, which no modern DE provides), so the title prefix is a
 *     portable fallback that every WM/DE renders in its taskbar tooltip
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
  #jobEmitter;
  #launcherEmitter;
  #session = null;
  // Hold strong references to live `Notification` instances so the V8 garbage
  // collector doesn't reap them — and their click/close listeners — between
  // `show()` and the user actually interacting with the toast. Entries are
  // removed on `click` or `close`.
  #activeNotifications = new Set();
  // Active downloads tracked for the taskbar progress bar. Removed in `done`.
  #activeItems = new Set();
  // Per-item JobView handle promises. The emitter's `start()` is async (one
  // DBus round-trip to `requestView`); subsequent `update()` / `finish()`
  // calls `.then()` onto the stored promise so events that arrive before
  // requestView resolves are applied as soon as the handle exists.
  #itemJobs = new Map();

  /**
   * @param {object} config - Application configuration.
   * @param {object} mainAppWindow - Module exposing `getWindow()` for the main BrowserWindow.
   * @param {{start: (Object) => Promise<{update: Function, finish: Function}>}} [jobEmitter] -
   *   Optional desktop job-view emitter (KDE's `org.kde.JobViewServer` —
   *   the protocol Plasma's notification widget uses to render progress
   *   for Firefox / Dolphin / KIO downloads). Tests omit this so DBus
   *   traffic never happens during unit tests.
   * @param {{update: (props: object) => void}} [launcherEmitter] -
   *   Optional Unity LauncherEntry emitter (`com.canonical.Unity
   *   .LauncherEntry.Update` D-Bus broadcast). Ubuntu Dock and Dash-to-Dock
   *   subscribe to this signal to render progress on the running app's dock
   *   icon — covers the GNOME/Ubuntu majority of the Linux audience that
   *   Electron's `setProgressBar` no longer reaches. Tests omit this.
   */
  constructor(config, mainAppWindow, jobEmitter = null, launcherEmitter = null) {
    this.#config = config;
    this.#mainAppWindow = mainAppWindow;
    this.#jobEmitter = jobEmitter;
    this.#launcherEmitter = launcherEmitter;
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
      this.#startJob(item);
      onUpdated = () => {
        this.#updateProgressBar();
        this.#updateJob(item);
      };
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
        this.#finishJob(item, state);
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

  // The title-prefix path always fires on every Linux setup — `setProgressBar`
  // and the D-Bus emitters fail closed on unsupported environments, but
  // `window.setTitle` always succeeds. Users who already see KDE JobView
  // rows or Ubuntu LauncherEntry badges can opt out of the title churn by
  // setting this sub-flag to false.
  #shouldShowTitlePrefix() {
    return this.#config?.download?.showTitlePrefix !== false;
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

    const showTitlePrefix = this.#shouldShowTitlePrefix();

    if (this.#activeItems.size === 0) {
      window.setProgressBar(-1);
      this.#launcherEmitter?.update({ progressVisible: false });
      if (showTitlePrefix) this.#clearTitlePrefix(window);
      return;
    }

    // Per-item fractions for the window-title prefix (so users with
    // multiple concurrent downloads see e.g. `[34%, 78%]` rather than a
    // single aggregate that hides whether one item is stalled).
    const itemFractions = [];
    let knownTotal = 0;
    let knownReceived = 0;
    let hasUnknownTotal = false;
    for (const item of this.#activeItems) {
      const total = item.getTotalBytes?.() ?? 0;
      const received = item.getReceivedBytes?.() ?? 0;
      if (!total || total <= 0) {
        hasUnknownTotal = true;
        itemFractions.push(null);
        continue;
      }
      knownTotal += total;
      knownReceived += received;
      itemFractions.push(Math.max(0, Math.min(1, received / total)));
    }

    if (hasUnknownTotal && knownTotal <= 0) {
      // Every active item has unknown total: indeterminate.
      window.setProgressBar(2, { mode: "indeterminate" });
      this.#launcherEmitter?.update({ progressVisible: false });
      if (showTitlePrefix) this.#applyTitlePrefix(window, itemFractions);
      return;
    }

    // setProgressBar and LauncherEntry are single-value protocols, so they
    // get the byte-weighted aggregate. The window title surfaces the
    // per-item breakdown.
    const aggregate = knownTotal > 0
      ? Math.max(0, Math.min(1, knownReceived / knownTotal))
      : 0;
    window.setProgressBar(aggregate);
    this.#launcherEmitter?.update({ progress: aggregate, progressVisible: true });
    if (showTitlePrefix) this.#applyTitlePrefix(window, itemFractions);
  }

  /**
   * Open a per-item JobView (KDE notification-widget progress) for the
   * given DownloadItem. Records the resulting handle promise so subsequent
   * `update`/`finish` calls can chain onto it even if they fire before the
   * `requestView` round-trip resolves.
   *
   * @param {Electron.DownloadItem} item
   */
  #startJob(item) {
    if (!this.#jobEmitter) return;
    const filename = item.getFilename?.();
    const totalBytes = item.getTotalBytes?.();
    const promise = Promise.resolve(
      this.#jobEmitter.start({
        filename,
        totalBytes: typeof totalBytes === "number" && totalBytes > 0 ? totalBytes : undefined,
      }),
    ).catch((error) => {
      console.warn("[DownloadManager] JobView start failed", { message: error?.message });
      return null;
    });
    this.#itemJobs.set(item, promise);
  }

  /**
   * Forward the latest receivedBytes/totalBytes to the per-item JobView.
   * No-op when the emitter wasn't supplied or the item has no live job.
   *
   * @param {Electron.DownloadItem} item
   */
  #updateJob(item) {
    const promise = this.#itemJobs.get(item);
    if (!promise) return;
    const receivedBytes = item.getReceivedBytes?.() ?? 0;
    const totalBytes = item.getTotalBytes?.() ?? 0;
    promise.then((handle) => handle?.update?.({ receivedBytes, totalBytes }));
  }

  /**
   * Terminate the per-item JobView and forget the handle. KDE removes the
   * row from the notification widget when the view terminates; passing a
   * non-empty `error` string surfaces it as a job failure.
   *
   * @param {Electron.DownloadItem} item
   * @param {string} state - DownloadItem.state passed by Electron's `done` event.
   */
  #finishJob(item, state) {
    const promise = this.#itemJobs.get(item);
    if (!promise) return;
    this.#itemJobs.delete(item);
    const error = state === "completed" ? "" : `Download ${state}`;
    promise.then((handle) => handle?.finish?.({ error }));
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
   * @param {Array<number|null>} fractions - one entry per active download:
   *   a 0..1 number for known progress, or null for an item with an
   *   unknown total size. Examples: `[0.34]` -> `[34%]`, `[0.34, 0.78]`
   *   -> `[34%, 78%]`, `[0.5, null]` -> `[50%, downloading]`,
   *   `[null]` -> `[downloading]`.
   */
  #applyTitlePrefix(window, fractions) {
    const currentTitle = window.getTitle();
    const baseTitle = stripDownloadPrefix(currentTitle);
    const parts = fractions.map((fraction) =>
      fraction === null ? "downloading" : `${Math.round(fraction * 100)}%`,
    );
    const next = `[${parts.join(", ")}] ${baseTitle}`;
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
