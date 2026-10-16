/**
 * Window-open handling for the Document Picture-in-Picture replacement
 * (app/browser/tools/documentPictureInPicture.js, MC1462921 "Call Monitor").
 *
 * The browser tool opens its PiP window as an `about:blank` popup with a fixed
 * frame name. The root window's `onNewWindow` denies every other
 * `about:blank` popup (they belong to the silent SSO flow), so this request
 * has to be recognised first and allowed as a small, always-on-top window.
 * Profile views allow `about:blank` already but get the same window options
 * so the call monitor looks and stacks the same in every profile.
 *
 * Pure (no Electron imports) so the decision is unit-testable.
 */

// Must match PIP_FRAME_NAME in app/browser/tools/documentPictureInPicture.js.
const PIP_FRAME_NAME = "teams-for-linux-document-pip";

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
    },
  };
}

module.exports = {
  PIP_FRAME_NAME,
  PIP_MAX_WIDTH,
  PIP_MAX_HEIGHT,
  isDocumentPictureInPictureRequest,
  documentPictureInPictureResponse,
};
