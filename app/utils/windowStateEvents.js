// BrowserWindow events after which the content size can differ from what an
// overlay was last laid out against. On X11/XWayland a maximize or restore
// does not reliably deliver a `resize` that views pick up (#2947), so every
// overlay positioned against the window re-lays-out on these as well.
const WINDOW_STATE_EVENTS = Object.freeze([
  "maximize",
  "unmaximize",
  "restore",
  "enter-full-screen",
  "leave-full-screen",
]);

module.exports = { WINDOW_STATE_EVENTS };
