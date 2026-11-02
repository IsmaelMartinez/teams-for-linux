/**
 * Integrated title bar (client-side decorations), renderer half.
 *
 * With `window.titleBar: "integrated"` the system title bar is hidden and
 * Electron draws the window controls over the right end of Teams' top bar,
 * as in the official Windows client. This module:
 *
 * - keeps the interactive parts of the top bar clickable inside its drag region,
 * - reports the bar's height and background colour, so the window controls
 *   (drawn on a transparent background) get a matching size, glyph colour
 *   and hover colour,
 * - lets the Teams top bar shrink in narrow windows, so its "..." menu and
 *   avatar are not pushed under the controls,
 * - reserves room on the right when Teams' own buttons would sit under the
 *   controls, but only for Teams builds that do not already leave that room
 *   themselves (current ones do, through Window Controls Overlay),
 * - adds a thin drag strip on pages without a Teams top bar (the Microsoft
 *   sign-in pages), so the window can still be moved there, hides the page
 *   scrollbar there so it does not run up under the controls, and picks the
 *   glyph colour from the page background.
 *
 * Teams' DOM changes without notice, so every lookup is defensive and the
 * whole module degrades to "controls over the page" if nothing matches.
 */

const CHANNEL = "title-bar-overlay-update";
const STYLE_ID = "tfl-integrated-title-bar";
const DRAG_STRIP_ID = "tfl-title-bar-drag-strip";
const NO_TOP_BAR_CLASS = "tfl-no-top-bar";
const RESERVE_CLASS = "tfl-wco-reserve";
const CHECK_DELAY_MS = 500;
const DEFAULT_HEIGHT = 48;
const LIGHT_GLYPHS = "#ffffff";
const DARK_GLYPHS = "#242424";
const LIGHT_PAGE = { r: 255, g: 255, b: 255 };
const DARK_PAGE = { r: 0, g: 0, b: 0 };
const DARK_SCHEME = "(prefers-color-scheme: dark)";

const ANCHOR_SELECTORS = [
  '[data-tid="search-f6-navigation-region"]',
  '[role="search"]',
  'button[data-tid="waffle-open-button"]',
];

const TEAMS_TITLE_BAR = '[data-tid="title-bar"]';
const SEARCH_REGION = `${TEAMS_TITLE_BAR} [data-tid="search-f6-navigation-region"]`;

const INTERACTIVE_SELECTOR = 'button, a, input, [role="button"], [role="search"], [tabindex]';

const STYLE = `
  [data-tid="search-f6-navigation-region"],
  [role="search"],
  button[data-tid="waffle-open-button"],
  .tfl-nav-button {
    -webkit-app-region: no-drag;
  }
  .${RESERVE_CLASS} {
    -webkit-app-region: drag;
    box-sizing: border-box !important;
    padding-right: calc(100vw - env(titlebar-area-x, 0px) - env(titlebar-area-width, 100vw)) !important;
  }
  .${RESERVE_CLASS} :is(${INTERACTIVE_SELECTOR}) {
    -webkit-app-region: no-drag;
  }
  #${DRAG_STRIP_ID} {
    position: fixed;
    top: 0;
    left: env(titlebar-area-x, 0px);
    width: env(titlebar-area-width, 100vw);
    height: env(titlebar-area-height, 32px);
    -webkit-app-region: drag;
    z-index: 2147483647;
  }
  /* Teams centres its search box between a start and an end area that it
     keeps at one fixed, equal width (214px in the build measured), and the
     search box has a 468px minimum. In a narrow window that overflows the bar
     and pushes the "..." menu and the avatar under the window controls. Let
     the side areas shrink to their content and the search box give up only
     the width that is missing, keeping Teams' 480px when there is room. */
  ${TEAMS_TITLE_BAR} [data-tid="titlebar-start-slot"],
  ${TEAMS_TITLE_BAR} [data-tid="titlebar-end-slot"] {
    flex: 1 1 0 !important;
    width: auto !important;
    min-width: min-content !important;
  }
  ${SEARCH_REGION} {
    flex: 0 1 480px !important;
    min-width: 0 !important;
  }
  ${SEARCH_REGION} div {
    min-width: 0 !important;
  }
  ${SEARCH_REGION} [data-tid="titlebar-main-slot-main-window"] {
    flex: 1 1 auto !important;
    width: 100% !important;
  }
  ${SEARCH_REGION} [data-tid="titlebar-main-slot-main-window"] > *,
  ${SEARCH_REGION} form,
  ${SEARCH_REGION} form > *,
  ${SEARCH_REGION} form > * > * {
    flex: 1 1 auto !important;
  }
  /* Without a Teams top bar the page's scrollbar would run up under the window
     controls. Hide it; the page still scrolls with wheel, touchpad and keys. */
  html.${NO_TOP_BAR_CLASS} {
    scrollbar-width: none;
  }
`;

function isEnabled(config) {
  return (
    config?.window?.titleBar === "integrated" &&
    config?.frame !== false &&
    process.platform !== "darwin"
  );
}

function parseRgb(value) {
  const match = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+%?))?\s*\)/.exec(value || "");
  if (!match) return null;
  const alphaText = match[4] ?? "";
  let alpha = 1;
  if (alphaText) {
    alpha = alphaText.endsWith("%") ? Number.parseFloat(alphaText) / 100 : Number.parseFloat(alphaText);
  }
  return { r: Number(match[1]), g: Number(match[2]), b: Number(match[3]), a: alpha };
}

function toHex({ r, g, b }) {
  return `#${[r, g, b].map((n) => Math.min(255, n).toString(16).padStart(2, "0")).join("")}`;
}

// Used when the page has no readable background colour, such as the Microsoft
// sign-in pages, whose background is an image. Those pages follow the system
// colour scheme, so the controls do too.
function schemeFallback(matchMedia = globalThis.matchMedia) {
  try {
    return matchMedia?.(DARK_SCHEME).matches ? DARK_PAGE : LIGHT_PAGE;
  } catch {
    return LIGHT_PAGE;
  }
}

// Relative luminance (WCAG) to pick light or dark control glyphs.
function isDark({ r, g, b }) {
  const lin = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b) < 0.4;
}

// First opaque background walking up from the element.
function effectiveBackground(element) {
  for (let el = element; el; el = el.parentElement) {
    const rgb = parseRgb(getComputedStyle(el).backgroundColor);
    if (rgb && rgb.a > 0.5) return rgb;
  }
  return null;
}

// The top bar is the widest ancestor of a known top-bar control that is
// pinned to the top edge and no taller than a title bar. Wrappers between the
// control and the bar are often vertically centred, so they are skipped rather
// than ending the walk; it ends once an ancestor is taller than a title bar.
function findTopBar() {
  let anchor = null;
  for (const selector of ANCHOR_SELECTORS) {
    anchor = document.querySelector(selector);
    if (anchor) break;
  }
  if (!anchor) return null;

  let bar = null;
  for (let el = anchor.parentElement; el && el !== document.body; el = el.parentElement) {
    const rect = el.getBoundingClientRect();
    if (rect.height > 80) break;
    if (rect.top <= 1 && rect.width >= window.innerWidth * 0.9 && rect.height >= 24) bar = el;
  }
  return bar;
}

// Current Teams builds support Window Controls Overlay themselves: their title
// bar pads its right edge by the controls' width. Padding again would leave a
// gap of twice that width, so the fallback padding is only for builds that
// do not. When the fallback padding sits on the Teams title bar itself, that
// padding is ours, not Teams', so it does not count; otherwise the padding
// would be added and removed on every check.
function teamsReservesControls(area) {
  const teamsBar = document.querySelector(TEAMS_TITLE_BAR);
  if (!teamsBar || teamsBar.classList.contains(RESERVE_CLASS)) return false;
  const controlsWidth = window.innerWidth - (area.x + area.width);
  return Number.parseFloat(getComputedStyle(teamsBar).paddingRight) >= controlsWidth - 1;
}

// Whether any of Teams' own controls in the bar sit under the window controls.
function overlapsControls(bar, area) {
  const controlsLeft = area.x + area.width;
  for (const el of bar.querySelectorAll(INTERACTIVE_SELECTOR)) {
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0 && rect.right > controlsLeft + 1 && rect.top < area.height) {
      return true;
    }
  }
  return false;
}

class IntegratedTitleBar {
  #ipcRenderer = null;
  #lastSent = "";
  #scheduled = false;
  #reservedBar = null;

  init(config, ipcRenderer) {
    if (!isEnabled(config) || !ipcRenderer) return;
    this.#ipcRenderer = ipcRenderer;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = STYLE;
    document.head.appendChild(style);

    const schedule = () => this.#schedule();
    new MutationObserver(schedule).observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "data-theme"],
    });
    window.addEventListener("resize", schedule);
    globalThis.matchMedia?.(DARK_SCHEME)?.addEventListener?.("change", schedule);
    navigator.windowControlsOverlay?.addEventListener?.("geometrychange", schedule);
    this.#check();
  }

  #schedule() {
    if (this.#scheduled) return;
    this.#scheduled = true;
    setTimeout(() => {
      this.#scheduled = false;
      this.#check();
    }, CHECK_DELAY_MS);
  }

  #check() {
    try {
      const bar = findTopBar();
      this.#toggleDragStrip(!bar);
      if (bar) {
        this.#reserveSpace(bar);
      }
      this.#report(bar);
    } catch (err) {
      console.debug("[TITLE_BAR] Top bar check failed", { error: err.message });
    }
  }

  #toggleDragStrip(show) {
    document.documentElement.classList.toggle(NO_TOP_BAR_CLASS, show);
    const strip = document.getElementById(DRAG_STRIP_ID);
    if (show && !strip && document.body) {
      const div = document.createElement("div");
      div.id = DRAG_STRIP_ID;
      document.body.appendChild(div);
    } else if (!show && strip) {
      strip.remove();
    }
  }

  #reserveSpace(bar) {
    const wco = navigator.windowControlsOverlay;
    const area = wco?.visible ? wco.getTitlebarAreaRect() : null;
    const teamsReserves = area !== null && teamsReservesControls(area);
    if (this.#reservedBar && (this.#reservedBar !== bar || !area || teamsReserves)) {
      this.#reservedBar.classList.remove(RESERVE_CLASS);
      this.#reservedBar = null;
    }
    if (!area || teamsReserves || this.#reservedBar) return;
    if (overlapsControls(bar, area)) {
      bar.classList.add(RESERVE_CLASS);
      this.#reservedBar = bar;
    }
  }

  // Without a top bar (sign-in, loading) the controls keep the default height
  // and read the page background; sign-in backgrounds are images that have no
  // computed colour, so the system colour scheme is the fallback. The colour
  // is sent so the main process can derive a matching hover background.
  #report(bar) {
    const height = bar ? Math.round(bar.getBoundingClientRect().height) : DEFAULT_HEIGHT;
    if (height < 24 || height > 80) return;
    const bg = effectiveBackground(bar ?? document.body) ?? schemeFallback();
    const update = {
      height,
      color: toHex(bg),
      symbolColor: isDark(bg) ? LIGHT_GLYPHS : DARK_GLYPHS,
    };
    const key = JSON.stringify(update);
    if (key === this.#lastSent) return;
    this.#lastSent = key;
    this.#ipcRenderer.send(CHANNEL, update);
  }
}

module.exports = new IntegratedTitleBar();
module.exports._internals = { isEnabled, parseRgb, toHex, isDark, schemeFallback, teamsReservesControls, STYLE };
