/**
 * A link that arrives before the active profile's view exists.
 *
 * With multi-account on and the stored active profile living in a
 * WebContentsView, a link must not land on the root window (Profile 0) just
 * because the view, and the deep-link target getter that points at it, are not
 * there yet: that covers the launch argument and any second instance during
 * startup. The link is held, newest wins, and handed to the view manager as
 * that view's first load. "Not ready" is the condition, not "flag off": with
 * the flag off, or Profile 0 active, nothing is ever held.
 *
 * @param {object} deps
 * @param {() => boolean} deps.shouldHold - True while multi-account is on, the
 *   active profile is a view, and that view is not wired up yet
 * @param {(url: string) => boolean} deps.isHttpsUrl - A view runs with the
 *   full preload, so only https links go there
 * @returns {{offer: (url: string) => boolean, take: () => string|null}}
 */
function createLaunchLinkHold({ shouldHold, isHttpsUrl }) {
  let held = null;

  return {
    /** Holds `url` when it belongs to the not-yet-ready view; true if held. */
    offer(url) {
      if (!isHttpsUrl(url) || !shouldHold()) return false;
      held = url;
      return true;
    },

    /** Hands over the held link, once. */
    take() {
      const url = held;
      held = null;
      return url;
    },
  };
}

module.exports = { createLaunchLinkHold };
