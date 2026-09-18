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
const { isTeamsHost } = require("../helpers/teamsHosts");
const { COMPOSE_SELECTORS, findCompose } = require("../helpers/composeBox");

const LAUNCHER_ROUTE = /^(\/l\/[^/?#]+\/[^?#]+?)\/?(\?.*)?$/;

// A chat launcher naming neither a thread nor recipients has nothing to
// resolve, and the SPA lands on an empty chat surface rather than declining
// the route. A thread id (`/l/chat/<thread>/conversations`) resolves in page.
const EMPTY_CHAT_ROUTE = "/l/chat/0/0";

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
  if (route === EMPTY_CHAT_ROUTE && !/[?&]users=[^&]/.test(query)) {
    return null;
  }

  return `#${route}${query}`;
}

function isTeamsOrigin(frameUrl, configuredOrigin) {
  try {
    const { protocol, hostname, origin } = new URL(frameUrl);
    return origin === configuredOrigin || (protocol === "https:" && isTeamsHost(hostname));
  } catch {
    return false;
  }
}

// The SPA occupies the main frame. The check keeps the fragment off unrelated
// content, such as the login origin mid-auth. Two acceptances: the configured
// origin, which covers a `url` override outside the known hosts (GovCloud's
// `gov.teams.microsoft.us`, ADR-020), and any Teams host, since Teams redirects
// `teams.microsoft.com` sessions to `teams.cloud.microsoft`.
function findRouterFrame(mainFrame, configuredOrigin) {
  return isTeamsOrigin(mainFrame.url, configuredOrigin) ? mainFrame : null;
}

// An unparsable configured URL only loses its own acceptance: a session on a
// known Teams host still routes. Opaque origins (`file:`, `data:`) all
// serialise to the string "null" and would match any `about:blank` frame.
function configuredOriginOf(teamsUrl) {
  try {
    const { origin } = new URL(teamsUrl);
    return origin === "null" ? null : origin;
  } catch {
    return null;
  }
}

// The SPA rewrote the fragment within 26ms when measured. This budget is only
// ever spent when it declines the route, delaying the fallback reload.
const ROUTE_CONSUMED_TIMEOUT_MS = 750;

/**
 * Attempts to reach a deep link through the loaded SPA's router.
 *
 * @param {Electron.BrowserWindow} window - Main application window
 * @param {string} url - Deep link URL resolved from the launch argument
 * @param {string} teamsUrl - Configured Teams URL, accepted as the frame's
 *   origin alongside the known Teams hosts
 * @returns {Promise<boolean>} True when the SPA consumed the route; false
 *   means the caller should fall back to a full navigation
 */
async function navigateInPage(window, url, teamsUrl) {
  const route = toHashRoute(url);
  if (!route) {
    return false;
  }

  const configuredOrigin = configuredOriginOf(teamsUrl);

  // Electron throws "Object has been destroyed" rather than returning
  // undefined when the window is torn down mid-flight, so this reaches the
  // fallback instead of rejecting out of the module.
  let frame;
  try {
    frame = findRouterFrame(window.webContents.mainFrame, configuredOrigin);
  } catch {
    return false;
  }
  if (!frame) {
    return false;
  }

  try {
    // Assigning the fragment always sticks, so the assignment proves nothing.
    // The SPA signals that it handled the route by rewriting the fragment or,
    // on builds that leave the fragment alone, by retitling the document for
    // the target; a fragment still holding the assigned value under the old
    // title was never consumed. The previous fragment goes back before giving
    // up, so an aborted fallback navigation does not strand the page on a
    // route nothing answered.
    return await frame.executeJavaScript(
      `new Promise((resolve) => {
         let timer;
         const target = ${JSON.stringify(route)};
         const previous = location.hash;
         // The unread counter also rewrites the title ("(3) Calendar | …"), so
         // only the part after it tells whether the SPA moved to the target.
         const bareTitle = () => document.title.replace(/^\\(\\d+\\)\\s*/, "");
         const previousTitle = bareTitle();
         // Re-assigning an identical fragment fires no \`hashchange\`, so the
         // wait below would time out and reload a page already on the route.
         if (previous === target) { resolve(true); return; }
         location.hash = target;
         const assigned = location.hash;
         const settle = (consumed) => {
           clearTimeout(timer);
           removeEventListener("hashchange", onHashChange);
           titleWatch.disconnect();
           if (!consumed) {
             history.replaceState(null, "", previous || location.pathname + location.search);
           }
           resolve(consumed);
         };
         const onHashChange = () => {
           if (location.hash !== assigned) settle(true);
         };
         const titleWatch = new MutationObserver(() => {
           if (bareTitle() !== previousTitle) settle(true);
         });
         // Observed on <head>: Teams replaces the <title> element outright on
         // React remounts (see browser/tools/mutationTitle.js), which would
         // strand an observer attached to the old node.
         titleWatch.observe(document.head, { childList: true, characterData: true, subtree: true });
         // \`hashchange\` is queued as a task, so it cannot dispatch until this
         // block returns: registering after the assignment misses nothing.
         addEventListener("hashchange", onHashChange);
         // Current SPA builds keep no route in the fragment and clear the
         // assigned one through the history API, which fires no hashchange
         // (measured: gone at every sample, 342-1198 ms after assignment);
         // a fragment that no longer holds the assigned value at the deadline
         // was consumed all the same, retitled or not.
         timer = setTimeout(() => settle(location.hash !== assigned), ${ROUTE_CONSUMED_TIMEOUT_MS});
       })`
    );
  } catch {
    console.debug("[DEEPLINK] in-page routing rejected");
    return false;
  }
}

// Routes that land on a conversation, where the caret belongs in the compose
// box. The SPA opens the conversation but leaves focus wherever it was, so
// typing right after following a link goes nowhere.
const CONVERSATION_ROUTE = /^#\/l\/(chat|message)\//;

// The target conversation mounts its editor after the route is consumed, and
// switching from another chat replaces the previous editor with it.
const COMPOSE_FOCUS_TIMEOUT_MS = 1500;

/**
 * Runs in the renderer (serialised by `focusCompose`). Focuses the compose box
 * and keeps it focused while the conversation view settles: an editor focused
 * too early belongs to the chat being left and is removed with it. Backs off
 * at the first key or pointer input, so it never fights the user.
 *
 * @param {(doc: Document, selectors: string[]) => Element|null} find -
 *   `findCompose` from helpers/composeBox, passed in because this runs serialised
 * @param {string[]} selectors - Compose box selectors, most specific first
 * @param {number} timeoutMs - How long the view is given to settle
 * @returns {Promise<boolean>} Whether the compose box holds focus at the end
 */
function focusComposeBox(find, selectors, timeoutMs) {
  return new Promise((resolve) => {
    let focused = null;
    const refocus = () => {
      if (focused?.isConnected && document.activeElement === focused) return;
      const el = find(document, selectors);
      if (el) {
        el.focus();
        focused = el;
      }
    };
    const observer = new MutationObserver(refocus);
    const stop = () => {
      observer.disconnect();
      clearTimeout(timer);
      removeEventListener("keydown", stop, true);
      removeEventListener("pointerdown", stop, true);
      resolve(focused !== null && document.activeElement === focused);
    };
    const timer = setTimeout(stop, timeoutMs);
    addEventListener("keydown", stop, true);
    addEventListener("pointerdown", stop, true);
    observer.observe(document.body, { childList: true, subtree: true });
    refocus();
  });
}

/**
 * Puts the caret in the compose box after an in-page route to a conversation.
 * Best effort: a miss (meeting link, renamed selectors, torn-down window) is
 * not an error and changes nothing.
 *
 * @param {Electron.BrowserWindow} window - Main application window
 * @param {string} url - The deep link that was just routed in page
 * @param {string} teamsUrl - Configured Teams URL, as for `navigateInPage`
 * @returns {Promise<boolean>} Whether a compose box was focused
 */
async function focusCompose(window, url, teamsUrl) {
  const route = toHashRoute(url);
  if (!route || !CONVERSATION_ROUTE.test(route)) {
    return false;
  }
  try {
    const frame = findRouterFrame(window.webContents.mainFrame, configuredOriginOf(teamsUrl));
    if (!frame) {
      return false;
    }
    return await frame.executeJavaScript(
      `(${focusComposeBox.toString()})(${findCompose.toString()}, ${JSON.stringify(COMPOSE_SELECTORS)}, ${COMPOSE_FOCUS_TIMEOUT_MS})`
    );
  } catch {
    return false;
  }
}

module.exports = { toHashRoute, findRouterFrame, navigateInPage, focusCompose, focusComposeBox };
