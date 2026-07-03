const ReactHandler = require("./reactHandler");

// Teams mounts React asynchronously after preload runs, so its client
// preferences store is not available immediately. Poll for it, then stop.
const CLIENT_PREFERENCES_POLL_INTERVAL_MS = 1000;
const CLIENT_PREFERENCES_POLL_TIMEOUT_MS = 60000;

class ThemeManager {
  init(config, ipcRenderer) {
    this.ipcRenderer = ipcRenderer;
    this.config = config;

    // teams-for-linux is not a native Teams host. When Teams' own
    // `clientPreferences.theme.followOsTheme` is enabled, the Teams SPA queries
    // a host-provided `HostTheme!` GraphQL value that nothing answers; the
    // variable resolves to `undefined`, Teams throws an unhandled rejection
    // (#2662, #2712), and theme resolution falls back to the default (light)
    // theme, so the user's chosen theme silently resets and cannot be changed
    // live (#2692).
    //
    // Merely not setting `followOsTheme` (the previous #2673 fix) is not enough:
    // users who already had it enabled from an earlier version keep the stale
    // `true` value and keep hitting the crash. We actively force it to `false`
    // to clear that state and let Teams honour the persisted `userTheme`. We
    // follow the OS theme ourselves below by driving `userTheme` from the
    // main-process `system-theme-changed` events instead.
    this.#disableTeamsOsThemeFollow();

    if (config.followSystemTheme) {
      this.ipcRenderer.on("system-theme-changed", this.applyTheme);
    }
  }

  // Wait for Teams' client preferences to load, then force `followOsTheme` off.
  #disableTeamsOsThemeFollow() {
    const startedAt = Date.now();
    const timer = setInterval(() => {
      const clientPreferences = ReactHandler.getTeams2ClientPreferences();
      if (clientPreferences?.theme) {
        if (clientPreferences.theme.followOsTheme) {
          clientPreferences.theme.followOsTheme = false;
          console.debug(
            "Theme: disabled Teams followOsTheme to prevent HostTheme rejection"
          );
        }
        clearInterval(timer);
        return;
      }
      if (Date.now() - startedAt >= CLIENT_PREFERENCES_POLL_TIMEOUT_MS) {
        clearInterval(timer);
      }
    }, CLIENT_PREFERENCES_POLL_INTERVAL_MS);
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
