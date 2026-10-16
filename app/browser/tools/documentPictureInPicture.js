/**
 * DocumentPictureInPicture Browser Tool
 *
 * Replaces the page's `window.documentPictureInPicture` with a working
 * implementation so the Teams web "Call Monitor" (MC1462921) can show its
 * floating call controls while the user works elsewhere.
 *
 * Why this exists: Electron exposes the Document Picture-in-Picture API but has
 * no native host for the window it creates. `requestWindow()` resolves, then the
 * returned window fires `pagehide` about a millisecond later and is `closed`
 * before anything is drawn (verified on Electron 39 and 43 with a standalone
 * probe). Allowing the popup in the window-open handler does not change that.
 *
 * The replacement opens a same-origin `about:blank` popup with
 * `window.open()`. That returns a real `Window` whose document Teams can render
 * into exactly as it would into a native PiP window (it copies its stylesheets
 * and mounts its React tree there, with event handlers living in the opener).
 * The popup carries a fixed frame name so the main process recognises it in
 * `onNewWindow` and opens it as a small always-on-top window instead of
 * denying it like other `about:blank` popups (see
 * app/mainAppWindow/documentPictureInPicture.js).
 *
 * Diagnostics: the tool logs (without any meeting or user data) when Teams
 * requests a PiP window and when it registers the `enterpictureinpicture`
 * media session action, which Chrome uses to open PiP automatically on tab
 * switch. Filter the console for `[DOCUMENT_PIP]` to see whether Teams uses
 * either path.
 */

const LOG_PREFIX = "[DOCUMENT_PIP]";

// Must match PIP_FRAME_NAME in app/mainAppWindow/documentPictureInPicture.js.
const PIP_FRAME_NAME = "teams-for-linux-document-pip";

// Chrome's own default when requestWindow() is called without a size.
const DEFAULT_WIDTH = 400;
const DEFAULT_HEIGHT = 300;
const MIN_SIZE = 100;
// The main process enforces the same cap (PIP_MAX_WIDTH / PIP_MAX_HEIGHT);
// clamping here keeps the requested and actual sizes in agreement.
const MAX_WIDTH = 800;
const MAX_HEIGHT = 600;

function toDimension(value, fallback, max) {
  const number = Math.round(Number(value));
  if (!Number.isFinite(number) || number <= 0) {
    return fallback;
  }
  return Math.min(max, Math.max(MIN_SIZE, number));
}

/**
 * Build a `documentPictureInPicture` replacement bound to `win`.
 * @param {Window} win - The opener window (Teams' main window).
 */
function createDocumentPictureInPicture(win) {
  const events = new EventTarget();
  let current = null;
  let onenter = null;

  const isOpen = () => current !== null && !current.closed;

  const api = {
    get window() {
      return isOpen() ? current : null;
    },

    get onenter() {
      return onenter;
    },

    set onenter(handler) {
      onenter = typeof handler === "function" ? handler : null;
    },

    async requestWindow(options = {}) {
      // Spec: a new request replaces the existing PiP window.
      if (isOpen()) {
        current.close();
      }
      const width = toDimension(options?.width, DEFAULT_WIDTH, MAX_WIDTH);
      const height = toDimension(options?.height, DEFAULT_HEIGHT, MAX_HEIGHT);
      console.info(`${LOG_PREFIX} Teams requested a Picture-in-Picture window`, { width, height });

      const pip = win.open("about:blank", PIP_FRAME_NAME, `popup,width=${width},height=${height}`);
      if (!pip) {
        console.warn(`${LOG_PREFIX} Picture-in-Picture window was not opened`);
        throw new DOMException("Picture-in-Picture window could not be opened", "NotAllowedError");
      }

      current = pip;
      pip.addEventListener("pagehide", () => {
        if (current === pip) {
          current = null;
        }
      });

      const event = new Event("enter");
      Object.defineProperty(event, "window", { value: pip, enumerable: true });
      events.dispatchEvent(event);
      return pip;
    },

    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
    dispatchEvent: events.dispatchEvent.bind(events),
  };

  events.addEventListener("enter", (event) => {
    onenter?.call(api, event);
  });

  // A native PiP window closes with its opener; without this a reload of Teams
  // would leave an orphaned, unresponsive call monitor on screen.
  win.addEventListener("pagehide", () => {
    if (isOpen()) {
      current.close();
    }
  });

  return api;
}

/**
 * Log when Teams registers or clears the `enterpictureinpicture` media session
 * action. Chrome fires that action itself when the user switches tabs; Electron
 * has no tabs, so this tells us whether Teams relies on it.
 * @param {Navigator} nav
 */
function watchMediaSessionAction(nav) {
  const mediaSession = nav?.mediaSession;
  const original = mediaSession?.setActionHandler;
  if (typeof original !== "function") {
    return;
  }
  mediaSession.setActionHandler = function (action, handler) {
    if (action === "enterpictureinpicture") {
      console.info(`${LOG_PREFIX} Teams ${handler ? "registered" : "cleared"} the enterpictureinpicture media session action`);
    }
    return original.call(this, action, handler);
  };
}

function init(config, win = globalThis) {
  if (!config?.media?.documentPictureInPicture) {
    return;
  }

  try {
    Object.defineProperty(win, "documentPictureInPicture", {
      value: createDocumentPictureInPicture(win),
      configurable: true,
      enumerable: true,
      writable: false,
    });
    watchMediaSessionAction(win.navigator);
    console.info(`${LOG_PREFIX} Document Picture-in-Picture enabled`);
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to initialize:`, error);
  }
}

module.exports = { init, PIP_FRAME_NAME };
