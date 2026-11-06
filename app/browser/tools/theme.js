"use strict";

const ReactHandler = require("./reactHandler");

// Module-local, not a method: page script can replace anything on `this`
// before init registers the listener, and a page-supplied listener would get
// the Electron event, whose sender is the raw ipcRenderer (GHSA-58j7-22f8-6xqp).
function applyTheme(isDark) {
  const theme = isDark ? "dark" : "default";
  const clientPreferences = ReactHandler.getTeams2ClientPreferences();
  if (clientPreferences) {
    console.debug("Using react to set the theme");
    clientPreferences.theme.userTheme = theme;
    console.debug("Theme changed to", theme);
  }
}

class ThemeManager {
  // ipcRenderer is only used here, never stored.
  init(config, ipcRenderer) {
    // Deliberately do NOT set Teams' own `clientPreferences.theme.followOsTheme`.
    // teams-for-linux is not a native Teams host, so enabling it makes the Teams
    // SPA query a host-provided `HostTheme!` value that nothing answers; that
    // variable resolves to `undefined` and Teams throws an unhandled GraphQL
    // rejection (#2662). We follow the OS theme ourselves below by driving
    // `userTheme` from the main-process `system-theme-changed` events instead.
    if (config.followSystemTheme) {
      ipcRenderer.on("system-theme-changed", (_event, isDark) => applyTheme(isDark));
    }
  }
}

module.exports = new ThemeManager();
