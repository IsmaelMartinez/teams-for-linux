/**
 * Integrated title bar (client-side decorations).
 *
 * With `window.titleBar: "integrated"` the main window hides the system title
 * bar and Electron draws native minimise / maximise / close buttons over the
 * right end of Teams' own top bar, the way the official Windows client looks.
 * The Teams top bar becomes the drag handle. The renderer measures that bar
 * and reports its height and background colour, so the controls fit it.
 *
 * macOS is excluded: its traffic lights sit on the left, over Teams' own
 * controls, and the system title bar there already matches the platform.
 */

// Teams' top bar is 48px tall in every layout seen so far; the renderer
// corrects this once it has measured the real bar.
const DEFAULT_HEIGHT = 48;
const MIN_HEIGHT = 24;
const MAX_HEIGHT = 80;

// The overlay itself is transparent (alpha 00), so the buttons sit directly on
// whatever the page draws there (the Teams top bar, the sign-in background,
// the loading screen) instead of on a block of guessed colour. The RGB part
// still matters: the hover and pressed backgrounds are derived from it, so a
// transparent black gives a dark hover square that hides dark glyphs on a
// light page. The renderer therefore reports the page colour, and the overlay
// uses it at zero alpha.
const TRANSPARENT_ALPHA = "00";
const DARK_PAGE = "#000000";
const LIGHT_PAGE = "#ffffff";
const LIGHT_GLYPHS = "#ffffff";
const DARK_GLYPHS = "#242424";

const HEX_COLOR_RE = /^#[0-9a-f]{6}$/i;

/**
 * Whether the integrated title bar applies to this config on this platform.
 * A frameless window (`window.frame: false`) has no controls to draw, so it
 * wins over the integrated title bar.
 * @param {object} config
 * @param {string} [platform]
 * @returns {boolean}
 */
function isIntegratedTitleBar(config, platform = process.platform) {
  return (
    config?.window?.titleBar === "integrated" &&
    config?.frame !== false &&
    platform !== "darwin"
  );
}

/**
 * BrowserWindow options that turn the integrated title bar on.
 * @param {object} config
 * @param {boolean} dark - whether the system prefers a dark theme
 * @param {string} [platform]
 * @returns {object} options to spread into the BrowserWindow constructor
 */
function titleBarWindowOptions(config, dark, platform = process.platform) {
  if (!isIntegratedTitleBar(config, platform)) {
    return {};
  }
  return {
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: (dark ? DARK_PAGE : LIGHT_PAGE) + TRANSPARENT_ALPHA,
      symbolColor: dark ? LIGHT_GLYPHS : DARK_GLYPHS,
      height: DEFAULT_HEIGHT,
    },
  };
}

/**
 * Validate an overlay update sent by the renderer.
 * @param {unknown} payload
 * @returns {{height: number, color: string, symbolColor: string} | null}
 *   the overlay settings to apply: the page colour at zero alpha
 */
function sanitizeOverlayUpdate(payload) {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const { height, color, symbolColor } = payload;
  if (
    !Number.isInteger(height) ||
    height < MIN_HEIGHT ||
    height > MAX_HEIGHT ||
    typeof color !== "string" ||
    !HEX_COLOR_RE.test(color) ||
    typeof symbolColor !== "string" ||
    !HEX_COLOR_RE.test(symbolColor)
  ) {
    return null;
  }
  return { height, color: color + TRANSPARENT_ALPHA, symbolColor };
}

module.exports = {
  DEFAULT_HEIGHT,
  isIntegratedTitleBar,
  titleBarWindowOptions,
  sanitizeOverlayUpdate,
};
