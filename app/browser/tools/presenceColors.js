// Presence status colours, shared by the two places that draw the user's Teams
// status over an icon: the macOS Dock overlay (dockIconRenderer.js) and the
// tray icon (trayIconRenderer.js).
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

module.exports = { presenceColor, isDoNotDisturb };
