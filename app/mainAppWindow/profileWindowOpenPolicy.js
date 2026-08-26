/**
 * Window-open policy for profile `WebContentsView`s and their descendants
 * (ADR-020 Phase 2).
 *
 * Profile views historically installed NO `setWindowOpenHandler` at all — only
 * the root window has one (`onNewWindow` in mainAppWindow/index.js) — so every
 * `window.open()` from a profile view took Electron's default path: a bare new
 * BrowserWindow inheriting the view's partition and preload. This policy ports
 * the ONE part of the root behaviour that is provably safe per view:
 *
 *   - Teams deep links matching `meetupJoinRegEx` (meeting joins, but the
 *     default pattern also covers `/l/chat/`, `/l/channel/`, `/l/team/`, …):
 *     denied as a popup and, when `onNewWindowOpenMeetupJoinUrlInApp` is set,
 *     loaded IN THE ORIGINATING PROFILE VIEW — never in the root window, which
 *     is a different profile (#2867's window.open shape).
 *
 * Everything else stays on Electron's default `allow` — i.e. exactly what
 * profile views do today. The root window's remaining handling (ordinary
 * links → external browser with a Ctrl+click in-app override, auth popups →
 * deny + recovery) is NOT ported yet, deliberately: the Ctrl override reads
 * input state tracked only on the root window, the auth classifier is a
 * 3-host recovery-intercept list that misses sovereign clouds and federated
 * IdPs, and the deny path is coupled to root-only auth recovery. Porting any
 * of that piecemeal regresses profile views (links that open in-app today
 * would go external with no in-app escape hatch, stranding sign-in). It lands
 * together with per-profile auth recovery (tracked on #2495 with #2867).
 *
 * Pure (no Electron imports): `loadInView` is injected so the branch is
 * unit-testable; `installProfileWindowOpenHandler` is the thin binder that
 * targets a real webContents.
 */
function createProfileWindowOpenHandler({ config, loadInView }) {
  return (details) => {
    const url = typeof details?.url === "string" ? details.url : "";
    if (config.meetupJoinRegEx && new RegExp(config.meetupJoinRegEx).test(url)) {
      if (config.onNewWindowOpenMeetupJoinUrlInApp) {
        loadInView(url);
      }
      return { action: "deny" };
    }
    return { action: "allow" };
  };
}

/**
 * Install the policy on `targetWebContents`. Deep links always load into
 * `loadTargetWebContents` — the ORIGINATING PROFILE VIEW — even when the
 * target is one of its descendants (a popup or webview guest), so a meeting
 * link clicked inside an auth popup lands in the profile, not in the popup.
 * `activate` is then called so that profile becomes the visible one: the link
 * may have come from a popup belonging to a BACKGROUND profile, and silently
 * navigating a hidden view would leave the user staring at the wrong tenant.
 *
 * @param {Electron.WebContents} targetWebContents
 * @param {{ config: object, loadTargetWebContents?: Electron.WebContents,
 *           activate?: () => void }} deps
 */
function installProfileWindowOpenHandler(
  targetWebContents,
  { config, loadTargetWebContents = targetWebContents, activate }
) {
  targetWebContents.setWindowOpenHandler(
    createProfileWindowOpenHandler({
      config,
      loadInView: (url) => {
        if (loadTargetWebContents.isDestroyed?.()) return;
        loadTargetWebContents.loadURL(url, {
          userAgent: config.chromeUserAgent,
        });
        activate?.();
      },
    })
  );
}

module.exports = {
  createProfileWindowOpenHandler,
  installProfileWindowOpenHandler,
};
