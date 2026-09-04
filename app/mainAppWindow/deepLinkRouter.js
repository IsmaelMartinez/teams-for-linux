/**
 * In-page routing for Teams deep links.
 *
 * A full `loadURL` replaces the document and cold-boots the SPA. Assigning the
 * equivalent client-side route to `location.hash` reaches the target with no
 * navigation. Every failure mode returns false so the caller falls back to the
 * full navigation.
 *
 * Never log the route: `users` carries an email address and `context` carries
 * meeting identifiers.
 */

// Any `/l/<segment>/...` launcher route, such as `/l/chat/...`,
// `/l/meetup-join/...` or `/l/channel/...`. The set is deliberately open: the
// SPA decides which routes it resolves, and whatever it declines reaches the
// target through the full navigation instead.
const LAUNCHER_ROUTE = /^(\/l\/[^/?#]+\/[^?#]+?)\/?(\?.*)?$/;

// A chat launcher without recipients has nothing to resolve, and the SPA lands
// on an empty chat surface rather than declining the route.
const CHAT_ROUTE_PREFIX = "/l/chat/";

/**
 * Converts a Teams deep link into the equivalent client-side route.
 *
 * The query is carried through untouched so the SPA resolves the target
 * exactly as it would after a full navigation, including group chat links and
 * the `context` blob on meeting links.
 *
 * @param {string} url - Absolute URL produced from the launch argument
 * @returns {string|null} Fragment such as `#/l/chat/0/0?users=a@b.com`
 */
function toHashRoute(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  const candidate = parsed.hash.startsWith("#/")
    ? parsed.hash.slice(1)
    : parsed.pathname + parsed.search;

  const match = LAUNCHER_ROUTE.exec(candidate);
  if (!match) {
    return null;
  }

  const [, route, query = ""] = match;
  if (route.startsWith(CHAT_ROUTE_PREFIX) && !/[?&]users=[^&]/.test(query)) {
    return null;
  }

  return `#${route}${query}`;
}

function isSameOrigin(frameUrl, origin) {
  try {
    return new URL(frameUrl).origin === origin;
  } catch {
    return false;
  }
}

// The SPA occupies the main frame. The origin check keeps the fragment off
// unrelated content, such as the login origin mid-auth.
function findRouterFrame(mainFrame, teamsOrigin) {
  return isSameOrigin(mainFrame.url, teamsOrigin) ? mainFrame : null;
}

// The SPA rewrote the fragment within 26ms when measured. This budget is only
// ever spent when it declines the route, delaying the fallback reload.
const ROUTE_CONSUMED_TIMEOUT_MS = 750;

/**
 * Attempts to reach a deep link through the loaded SPA's router.
 *
 * @param {Electron.BrowserWindow} window - Main application window
 * @param {string} url - Deep link URL resolved from the launch argument
 * @param {string} teamsUrl - Configured Teams URL, used for the origin check
 * @returns {Promise<boolean>} True when the SPA consumed the route; false
 *   means the caller should fall back to a full navigation
 */
async function navigateInPage(window, url, teamsUrl) {
  const route = toHashRoute(url);
  if (!route) {
    return false;
  }

  let teamsOrigin;
  try {
    teamsOrigin = new URL(teamsUrl).origin;
  } catch {
    return false;
  }

  // Electron throws "Object has been destroyed" rather than returning
  // undefined when the window is torn down mid-flight, so this reaches the
  // fallback instead of rejecting out of the module.
  let frame;
  try {
    frame = findRouterFrame(window.webContents.mainFrame, teamsOrigin);
  } catch {
    return false;
  }
  if (!frame) {
    return false;
  }

  try {
    // Assigning the fragment always sticks, so the assignment proves nothing.
    // The SPA signals that it handled the route by rewriting the fragment, and
    // a fragment still holding the assigned value was never consumed. The
    // previous fragment goes back before giving up, so an aborted fallback
    // navigation does not strand the page on a route nothing answered.
    return await frame.executeJavaScript(
      `new Promise((resolve) => {
         let timer;
         const target = ${JSON.stringify(route)};
         const previous = location.hash;
         if (previous === target) { resolve(true); return; }
         location.hash = target;
         const assigned = location.hash;
         const settle = (consumed) => {
           clearTimeout(timer);
           removeEventListener("hashchange", onHashChange);
           if (!consumed) {
             history.replaceState(null, "", previous || location.pathname + location.search);
           }
           resolve(consumed);
         };
         const onHashChange = () => {
           if (location.hash !== assigned) settle(true);
         };
         // \`hashchange\` is queued as a task, so it cannot dispatch until this
         // block returns: registering after the assignment misses nothing.
         addEventListener("hashchange", onHashChange);
         timer = setTimeout(() => settle(false), ${ROUTE_CONSUMED_TIMEOUT_MS});
       })`
    );
  } catch {
    console.debug("[DEEPLINK] in-page routing rejected");
    return false;
  }
}

module.exports = { toHashRoute, findRouterFrame, navigateInPage };
