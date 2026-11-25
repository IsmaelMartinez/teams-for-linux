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
 *   - The Document Picture-in-Picture popup (documentPictureInPicture.js):
 *     allowed with the same always-on-top window options as the root window.
 *
 *   - A direct Microsoft login popup, only when `interceptAuthPopup` takes it:
 *     auth recovery (authRecovery.js) does so when the originating profile's
 *     own session recently reported an auth failure, recovers THAT profile
 *     and the popup is denied. Healthy-session login popups are not taken,
 *     and neither is a login host the recovery list does not know (sovereign
 *     clouds, federated IdPs): those keep the default below.
 *
 * Everything else stays on Electron's default `allow` — i.e. exactly what
 * profile views do today. The root window's remaining handling (ordinary
 * links → external browser with a Ctrl+click in-app override) is NOT ported,
 * deliberately: the Ctrl override reads input state tracked only on the root
 * window, and porting it piecemeal regresses profile views (links that open
 * in-app today would go external with no in-app escape hatch, stranding
 * sign-in). An about:blank login popup is not intercepted either: in a
 * profile view it opens as a real window the user can sign in from, unlike
 * the root window's, which dies in a hidden window.
 *
 * Pure (no Electron imports): `loadInView` is injected so the branch is
 * unit-testable; `installProfileWindowOpenHandler` is the thin binder that
 * targets a real webContents.
 */
const {
  isDocumentPictureInPictureRequest,
  documentPictureInPictureWindows,
} = require("./documentPictureInPicture");

function createProfileWindowOpenHandler({ config, loadInView, interceptAuthPopup }) {
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
    if (isDocumentPictureInPictureRequest(details, config)) {
      return documentPictureInPictureWindows.windowOpenResponse(details);
    }
    const url = typeof details?.url === "string" ? details.url : "";
    if (deepLinkRe?.test(url)) {
      if (config.onNewWindowOpenMeetupJoinUrlInApp) {
        loadInView(url);
      }
      return { action: "deny" };
    }
    if (interceptAuthPopup?.(url)) {
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
 *           activate?: () => void,
 *           interceptAuthPopup?: (url: string) => boolean }} deps
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
  { config, loadTargetWebContents = targetWebContents, activate, interceptAuthPopup }
) {
  targetWebContents.setWindowOpenHandler(
    createProfileWindowOpenHandler({
      config,
      interceptAuthPopup,
      loadInView: (url) => {
        if (loadTargetWebContents.isDestroyed?.()) return;
        // Deliberately not awaited: the window-open handler is synchronous,
        // and activation must not depend on the navigation resolving.
        navigateDeepLink(loadTargetWebContents, url, config.chromeUserAgent);
        activate?.();
      },
    })
  );
  documentPictureInPictureWindows.watchOpener(targetWebContents, config);
}

module.exports = {
  createProfileWindowOpenHandler,
  installProfileWindowOpenHandler,
};
