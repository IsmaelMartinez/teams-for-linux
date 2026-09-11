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
  // Compiled once, not per window.open. `meetupJoinRegEx` is user-configurable
  // and the config validator only checks it is a string — a malformed pattern
  // must degrade to "no deep-link interception" (the pre-policy default),
  // never throw inside the window-open handler (an uncaught main-process
  // exception is fatal, app/index.js).
  let deepLinkRe = null;
  if (config.meetupJoinRegEx) {
    try {
      deepLinkRe = new RegExp(config.meetupJoinRegEx);
    } catch {
      console.warn(
        "[ProfileWindowOpenPolicy] Invalid meetupJoinRegEx; deep-link interception disabled for profile views"
      );
    }
  }
  return (details) => {
    const url = typeof details?.url === "string" ? details.url : "";
    if (deepLinkRe?.test(url)) {
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
// Fire-and-forget navigation into the originating profile view. The SPA
// taking over the route rejects the load with ERR_ABORTED in normal use
// (#2950), and the process-wide unhandledRejection handler exits on anything
// it cannot classify — so the failure is handled HERE and the function never
// rejects; callers do not await it.
async function navigateDeepLink(webContents, url, userAgent) {
  try {
    await webContents.loadURL(url, { userAgent });
  } catch (error) {
    console.debug(
      "[ProfileWindowOpenPolicy] Deep-link navigation interrupted",
      { code: error?.code ?? error?.errno }
    );
  }
}

function installProfileWindowOpenHandler(
  targetWebContents,
  { config, loadTargetWebContents = targetWebContents, activate }
) {
  targetWebContents.setWindowOpenHandler(
    createProfileWindowOpenHandler({
      config,
      loadInView: (url) => {
        if (loadTargetWebContents.isDestroyed?.()) return;
        // Deliberately not awaited: the window-open handler is synchronous,
        // and activation must not depend on the navigation resolving.
        navigateDeepLink(loadTargetWebContents, url, config.chromeUserAgent);
        activate?.();
      },
    })
  );
}

module.exports = {
  createProfileWindowOpenHandler,
  installProfileWindowOpenHandler,
};
