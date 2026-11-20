/**
 * Window-open handling for the Document Picture-in-Picture replacement
 * (app/browser/tools/documentPictureInPicture.js, MC1462921 "Call Monitor").
 *
 * The browser tool opens its PiP window as an `about:blank` popup named
 * PIP_FRAME_NAME. The root window's `onNewWindow` denies every other
 * `about:blank` popup (they belong to the silent SSO flow), so this request
 * has to be recognised first and allowed as a small, always-on-top window.
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

// Upper bound for the PiP window. The page picks the size through the popup's
// `features`, so the cap is enforced here rather than trusted from the
// renderer: an always-on-top window must never be able to cover the screen.
// Must match MAX_WIDTH / MAX_HEIGHT in the browser tool.
const PIP_MAX_WIDTH = 800;
const PIP_MAX_HEIGHT = 600;

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

// Width and height come from the popup's `features` string, which Electron
// applies on its own; only the window behaviour and the cap are set here.
// alwaysOnTop is a request to the window manager: GNOME and KDE on Wayland
// may not keep the window above others.
function documentPictureInPictureResponse() {
  return {
    action: "allow",
    overrideBrowserWindowOptions: {
      alwaysOnTop: true,
      autoHideMenuBar: true,
      fullscreenable: false,
      maxWidth: PIP_MAX_WIDTH,
      maxHeight: PIP_MAX_HEIGHT,
      webPreferences: { ...PIP_WEB_PREFERENCES },
    },
  };
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
  documentPictureInPictureResponse,
  lockDocumentPictureInPictureWindow,
};
