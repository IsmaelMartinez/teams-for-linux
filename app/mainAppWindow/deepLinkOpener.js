const { DeferredDeepLink } = require("./deferredDeepLink");

const isGone = (target) => !target || target.isDestroyed();

/**
 * Opens Teams deep links on one surface: the root window's webContents, or,
 * with multiple accounts, the active profile's view (ADR-020). In-page
 * routing is preferred over a full navigation, and a link that would need the
 * full navigation during a call waits for the call to end.
 *
 * The surface is resolved once per link and kept for the whole call,
 * including a deferred release, so a link never follows a profile switch made
 * while it waited. Never log a link: it carries the recipient or meeting.
 *
 * @param {object} deps
 * @param {{navigateInPage: Function, focusCompose: Function}} deps.router
 * @param {() => Electron.WebContents} deps.resolveTarget - Surface for a new
 *   link; must fall back to the root window itself
 * @param {() => {url: string, chromeUserAgent: string}} deps.getConfig
 * @param {() => boolean} deps.isCallActive
 * @param {number} deps.deferDelayMs - Wait after a call ends before a held link opens
 * @returns {{open: (url: string, target?: Electron.WebContents) => Promise<void>,
 *   deferred: DeferredDeepLink}}
 */
function createDeepLinkOpener({ router, resolveTarget, getConfig, isCallActive, deferDelayMs }) {
  // Bumped per `open` call: after its await, only the newest call may fall back.
  let generation = 0;

  const deferred = new DeferredDeepLink(
    (url, target) =>
      open(url, target).catch(() => console.debug("[DEEPLINK] deferred navigation failed")),
    deferDelayMs
  );

  /**
   * @param {string} url - Deep link URL resolved from the launch argument
   * @param {Electron.WebContents} [pinnedTarget] - Surface fixed by an earlier
   *   step (a deferred release, or the caller that already resolved it)
   */
  async function open(url, pinnedTarget) {
    // The newest link wins, whichever way it ends up opening: one held from
    // earlier must not open over it, and the full navigation below can outlast
    // the release delay before `did-navigate` would get to cancel it.
    deferred.cancel();
    const mine = ++generation;

    const target = pinnedTarget ?? resolveTarget();
    if (isGone(target)) {
      console.debug("[DEEPLINK] target closed before the link could open, dropped");
      return;
    }
    const config = getConfig();

    const routed = await router.navigateInPage(target, url, config.url);
    if (routed) {
      console.debug("[DEEPLINK] routed in page");
      const { focused, afterMs } = await router.focusCompose(target, url, config.url);
      const outcome = focused ? `focused after ${afterMs} ms` : "not found";
      console.debug(`[DEEPLINK] compose box ${outcome}`);
      return;
    }

    // A released link is not held off by the second-instance cooldown, so a
    // newer one can arrive during the wait above; it owns the fallback then.
    if (mine !== generation) {
      console.debug("[DEEPLINK] superseded by a newer link, fallback skipped");
      return;
    }

    if (isGone(target)) {
      console.debug("[DEEPLINK] target closed before the link could open, dropped");
      return;
    }

    // Any active call defers, not only one in `target`: a call elsewhere is
    // rare enough that holding the link is cheaper than tracking calls per surface.
    if (isCallActive()) {
      // Only the URL is kept, never logged: it carries the recipient or meeting.
      console.info("[DEEPLINK] in-page routing unavailable during a call, deferring to the call end");
      deferred.defer(url, target);
      return;
    }

    console.debug("[DEEPLINK] in-page routing unavailable, reloading");
    await target.loadURL(url, { userAgent: config.chromeUserAgent });
  }

  return { open, deferred };
}

module.exports = { createDeepLinkOpener };
