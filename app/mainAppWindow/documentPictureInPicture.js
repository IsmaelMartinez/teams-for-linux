/**
 * Window-open handling for the Document Picture-in-Picture replacement
 * (app/browser/tools/documentPictureInPicture.js, MC1462921 "Call Monitor").
 *
 * The browser tool opens its PiP window as an `about:blank` popup named
 * PIP_FRAME_NAME. The root window's `onNewWindow` denies every other
 * `about:blank` popup (they belong to the silent SSO flow), so this request
 * has to be recognised first and allowed as an always-on-top window.
 * Profile views allow `about:blank` already but get the same window options
 * so the call monitor looks and stacks the same in every profile.
 *
 * Pure (no Electron imports) so the decision is unit-testable.
 */

const { randomUUID } = require("node:crypto");

// Random per launch and handed to the browser tool through the config, so only
// Teams' own scripts know it. With a fixed name, any cross-origin frame inside
// Teams (an app tab, for example) could open this always-on-top window and draw
// into it; the referrer cannot tell them apart, as Chromium sends none for an
// about:blank popup opened from an https page.
const PIP_FRAME_NAME = `teams-for-linux-document-pip-${randomUUID()}`;

/**
 * @param {{ url?: string, frameName?: string }} details - window-open details
 * @param {object} config - app configuration
 */
function isDocumentPictureInPictureRequest(details, config) {
  return (
    config?.media?.documentPictureInPicture === true &&
    details?.url === "about:blank" &&
    details?.frameName === PIP_FRAME_NAME
  );
}

// Largest size the page can give the PiP window, on open or later through
// window.resizeTo(): page script must never be able to cover the screen with an
// always-on-top window it draws into, for example with a fake sign-in prompt.
// It is not set as max size hints (maxWidth / maxHeight), because those also
// stop the user resizing and maximizing it. Must match MAX_WIDTH / MAX_HEIGHT
// in the browser tool.
const PIP_MAX_WIDTH = 800;
const PIP_MAX_HEIGHT = 600;
const PIP_DEFAULT_WIDTH = 400;
const PIP_DEFAULT_HEIGHT = 300;
const PIP_MIN_SIZE = 100;

// The popup must be sandboxed exactly like its opener. Teams windows and
// profile views run with `sandbox: false`, while a popup created through
// `overrideBrowserWindowOptions` otherwise gets Electron's default of
// `sandbox: true`. With the two differing, Chromium has to start the popup in
// a new renderer process and in a new browsing context group, so the opener
// link is dropped: `window.open()` returns `null` and Teams, which renders its
// call controls into the returned window, leaves an empty window behind
// (Electron 45; earlier versions kept the opener). Only `sandbox` has to
// match; context isolation and node integration are pinned to their secure
// values so a changed default can never hand the popup more, and no preload is
// set. `sandbox: false` belongs to the window, not to the blank document, so
// lockDocumentPictureInPictureWindow keeps the window on about:blank.
const PIP_WEB_PREFERENCES = Object.freeze({
  sandbox: false,
  contextIsolation: true,
  nodeIntegration: false,
});

function clampDimension(value, fallback, max) {
  const number = Math.round(Number(value));
  if (!Number.isFinite(number) || number <= 0) {
    return fallback;
  }
  return Math.min(max, Math.max(PIP_MIN_SIZE, number));
}

function requestedSize(features) {
  const values = new Map();
  for (const entry of String(features ?? "").split(",")) {
    const [key, value] = entry.split("=");
    values.set(key.trim().toLowerCase(), value?.trim());
  }
  return {
    width: clampDimension(values.get("width"), PIP_DEFAULT_WIDTH, PIP_MAX_WIDTH),
    height: clampDimension(values.get("height"), PIP_DEFAULT_HEIGHT, PIP_MAX_HEIGHT),
  };
}

class DocumentPictureInPictureWindows {
  // Size the user last resized the window to, reused for the rest of the
  // launch: Teams opens a new window every time the meeting view is left.
  #userSize = null;

  /**
   * Window-open response for a request isDocumentPictureInPictureRequest
   * accepted. The size is always set here, overriding the popup's `features`,
   * so the page's request is clamped rather than trusted.
   * alwaysOnTop is a request to the window manager: GNOME and KDE on Wayland
   * may not keep the window above others.
   * @param {{ features?: string }} details - window-open details
   */
  windowOpenResponse(details) {
    return {
      action: "allow",
      overrideBrowserWindowOptions: {
        ...(this.#userSize ?? requestedSize(details?.features)),
        alwaysOnTop: true,
        autoHideMenuBar: true,
        fullscreenable: false,
        webPreferences: { ...PIP_WEB_PREFERENCES },
      },
    };
  }

  /**
   * Apply the page size cap to every PiP window `webContents` opens.
   * @param {Electron.WebContents} webContents - a webContents that may open the PiP window
   * @param {object} config - app configuration
   */
  watchOpener(webContents, config) {
    webContents.on("did-create-window", (window, details) => {
      if (isDocumentPictureInPictureRequest(details, config)) {
        this.#watchWindow(window);
      }
    });
  }

  #watchWindow(window) {
    const opened = window.getBounds();

    // Fired only for page-initiated moves and resizes, never the user's. A
    // window the user made larger keeps its size when the page moves it.
    window.webContents.on("content-bounds-updated", (event, bounds) => {
      const [width, height] = window.getContentSize();
      const maxWidth = Math.max(PIP_MAX_WIDTH, width);
      const maxHeight = Math.max(PIP_MAX_HEIGHT, height);
      if (bounds.width > maxWidth || bounds.height > maxHeight) {
        event.preventDefault();
        window.setContentBounds({
          ...bounds,
          width: Math.min(bounds.width, maxWidth),
          height: Math.min(bounds.height, maxHeight),
        });
      }
    });

    // Teams closes the window from the page, which skips the "close" event and
    // leaves nothing to read the size from on "closed".
    let latest = null;
    window.on("resize", () => {
      const { width, height } = window.getNormalBounds();
      latest = { width, height };
    });
    window.once("closed", () => {
      if (latest && (latest.width !== opened.width || latest.height !== opened.height)) {
        this.#userSize = latest;
      }
    });
  }
}

// The PiP window runs unsandboxed to keep its opener link, so it must never
// leave about:blank: navigated to a URL it would become an unsandboxed renderer
// for that site with a live `window.opener` back to Teams. Teams only renders
// into the blank document, so blocking every navigation and popup costs
// nothing. Call it from `did-create-window` for PiP requests, after (or
// instead of) any other window-open policy, since the last handler set wins.
function lockDocumentPictureInPictureWindow(webContents) {
  webContents.on("will-navigate", (event) => event.preventDefault());
  webContents.setWindowOpenHandler(() => ({ action: "deny" }));
}

module.exports = {
  PIP_FRAME_NAME,
  PIP_MAX_WIDTH,
  PIP_MAX_HEIGHT,
  isDocumentPictureInPictureRequest,
  lockDocumentPictureInPictureWindow,
  DocumentPictureInPictureWindows,
  documentPictureInPictureWindows: new DocumentPictureInPictureWindows(),
};
