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
// renderer: an always-on-top window must never be able to cover the screen
// unless the user asks for it. The defaults keep it small; users who read
// shared content in the compact view can raise them with
// media.documentPictureInPictureMaxWidth / MaxHeight. The browser tool applies
// the same defaults and keys (MAX_WIDTH / MAX_HEIGHT there).
const PIP_MAX_WIDTH = 800;
const PIP_MAX_HEIGHT = 600;
// Matches MIN_SIZE in the browser tool: a smaller cap would be below the
// smallest window the page can ask for.
const PIP_MIN_SIZE = 100;

function capOrDefault(value, fallback) {
  const number = Math.round(Number(value));
  return Number.isFinite(number) && number >= PIP_MIN_SIZE ? number : fallback;
}

/**
 * The PiP window cap from the config, falling back to the defaults for a
 * missing or invalid value.
 * @param {object} config - app configuration
 * @returns {{ width: number, height: number }}
 */
function documentPictureInPictureMaxSize(config) {
  return {
    width: capOrDefault(config?.media?.documentPictureInPictureMaxWidth, PIP_MAX_WIDTH),
    height: capOrDefault(config?.media?.documentPictureInPictureMaxHeight, PIP_MAX_HEIGHT),
  };
}

// Width and height come from the popup's `features` string, which Electron
// applies on its own; only the window behaviour and the cap are set here.
// alwaysOnTop is a request to the window manager: GNOME and KDE on Wayland
// may not keep the window above others.
function documentPictureInPictureResponse(config) {
  const max = documentPictureInPictureMaxSize(config);
  return {
    action: "allow",
    overrideBrowserWindowOptions: {
      alwaysOnTop: true,
      autoHideMenuBar: true,
      fullscreenable: false,
      maxWidth: max.width,
      maxHeight: max.height,
    },
  };
}

module.exports = {
  PIP_FRAME_NAME,
  PIP_MAX_WIDTH,
  PIP_MAX_HEIGHT,
  documentPictureInPictureMaxSize,
  isDocumentPictureInPictureRequest,
  documentPictureInPictureResponse,
};
