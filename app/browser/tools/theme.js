"use strict";

const ReactHandler = require("./reactHandler");

class ThemeManager {
  // ipcRenderer is only used here, never stored: anything on `this` is
  // reachable from page script (GHSA-58j7-22f8-6xqp).
  init(config, ipcRenderer) {
    this.config = config;

    // Deliberately do NOT set Teams' own `clientPreferences.theme.followOsTheme`.
    // teams-for-linux is not a native Teams host, so enabling it makes the Teams
    // SPA query a host-provided `HostTheme!` value that nothing answers; that
    // variable resolves to `undefined` and Teams throws an unhandled GraphQL
    // rejection (#2662). We follow the OS theme ourselves below by driving
    // `userTheme` from the main-process `system-theme-changed` events instead.
    if (config.followSystemTheme) {
      ipcRenderer.on("system-theme-changed", this.applyTheme);
    }
  }

  async applyTheme(_event, ...args) {
    const theme = args[0] ? "dark" : "default";
    const clientPreferences = ReactHandler.getTeams2ClientPreferences();
    if (clientPreferences) {
      console.debug("Using react to set the theme");
      clientPreferences.theme.userTheme = theme;
      console.debug("Theme changed to", theme);
    }
  }
}

module.exports = new ThemeManager();
