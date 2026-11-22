// Presence status colours and predicates, shared by the places that draw the
// user's Teams status over an icon: the macOS Dock overlay
// (dockIconRenderer.js), the tray icon (trayIconRenderer.js) and the main
// window icon (windowIconRenderer.js).
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

// Whether the code is one of the five statuses the monitor reads off the Teams
// UI. The window icon drops its dot for anything else (unknown, signed out),
// where the tray keeps a grey one.
function isKnownPresence(status) {
  return Object.hasOwn(COLORS, status);
}

// The dot with its white ring, as the tray and the window icon draw it. The
// ring keeps it readable on a dark or busy icon, and Do Not Disturb reads as a
// white bar, exactly as on the macOS Dock. The bar is sized from the radius:
// 26 by 8 at the tray's radius of 24.
function drawPresenceDot(ctx, status, { x, y, radius }) {
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(x, y, radius + 6, 0, 2 * Math.PI);
  ctx.fill();

  ctx.fillStyle = presenceColor(status);
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, 2 * Math.PI);
  ctx.fill();

  if (isDoNotDisturb(status)) {
    const width = Math.round((radius * 13) / 12);
    const height = Math.round(radius / 3);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(x - width / 2, y - height / 2, width, height);
  }
}

// Opt-in presence overlay on the app icon (media.showStatusOnDockIcon): on
// macOS the Dock draws it, and the platforms that have no Dock get it on the
// tray icon instead. Main asks the same question (app/index.js) to decide
// whether a zero-unread icon is worth compositing at all.
function wantsPresenceStatus(config) {
  return config.media?.showStatusOnDockIcon === true && process.platform !== "darwin";
}

// Opt-in presence overlay on the main window icon (window.showStatus), which is
// what the taskbar or panel entry shows on Linux and Windows. macOS shows the
// Dock instead, so the option does nothing there.
function wantsWindowStatus(config) {
  return config.window?.showStatus === true && process.platform !== "darwin";
}

module.exports = {
  presenceColor,
  isDoNotDisturb,
  isKnownPresence,
  drawPresenceDot,
  wantsPresenceStatus,
  wantsWindowStatus,
};
