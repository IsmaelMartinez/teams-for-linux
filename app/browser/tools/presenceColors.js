// Presence status colours and predicates, shared by the places that draw the
// user's Teams status over an icon: the macOS Dock overlay
// (dockIconRenderer.js) and the tray icon (trayIconRenderer.js).
//
// Codes come from the status monitor: 1 available, 2 busy, 3 do not disturb,
// 4 away, 5 be right back. Anything else (including the -1 the monitor uses
// before it has seen the Teams UI) is unknown, and reads grey.

const COLORS = {
  1: "#107c41", // available, green
  2: "#d83b01", // busy, red
  3: "#a80000", // do not disturb, dark red
  4: "#ffb900", // away, yellow
  5: "#ffb900", // be right back, yellow
};

const UNKNOWN_COLOR = "#7f7f7f";

function presenceColor(status) {
  return COLORS[status] || UNKNOWN_COLOR;
}

function isDoNotDisturb(status) {
  return status === 3;
}

// Opt-in presence overlay on the app icon (media.showStatusOnDockIcon): on
// macOS the Dock draws it, and the platforms that have no Dock get it on the
// tray icon instead. Main asks the same question (app/index.js) to decide
// whether a zero-unread icon is worth compositing at all.
function wantsPresenceStatus(config) {
  return config.media?.showStatusOnDockIcon === true && process.platform !== "darwin";
}

module.exports = { presenceColor, isDoNotDisturb, wantsPresenceStatus };
