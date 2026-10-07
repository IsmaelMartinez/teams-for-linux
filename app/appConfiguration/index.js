const { default: Store } = require("electron-store");
const fs = require("node:fs");
const path = require("node:path");
const { BUILTIN_THEMES, discoverThemes, resolveTheme } = require("../customCSS/themes");
const { isPlainObject } = require("../config/validator");

// WeakMap-based private fields pattern provides true privacy without relying on newer
// JavaScript private field syntax (#property). This ensures compatibility with older
// Node.js versions while preventing external access to internal state.
let _AppConfiguration_configPath = new WeakMap();
let _AppConfiguration_startupConfig = new WeakMap();
let _AppConfiguration_legacyConfigStore = new WeakMap();
let _AppConfiguration_settingsStore = new WeakMap();

/**
 * Manages application configuration including startup settings and persistent stores.
 * Uses WeakMaps for true private fields to ensure configuration data cannot be accessed
 * or modified externally, providing a secure configuration management layer.
 */
class AppConfiguration {
  #customThemes;
  #customCSSPath;
  #themeSelection = null;

  /**
   * @param {string} configPath - Path to the configuration directory
   * @param {string} appVersion - Current application version for config compatibility
   */
  constructor(configPath, appVersion) {
    _AppConfiguration_configPath.set(this, configPath);
    _AppConfiguration_startupConfig.set(
      this,
      require("../config")(configPath, appVersion)
    );
    this.#customThemes = discoverThemes(configPath);
    this.#customCSSPath = resolveTheme(this.startupConfig, configPath, this.#customThemes);
    _AppConfiguration_legacyConfigStore.set(
      this,
      new Store({
        name: "config",
        clearInvalidConfig: true,
      })
    );
    _AppConfiguration_settingsStore.set(
      this,
      new Store({
        name: "settings",
        clearInvalidConfig: true,
      })
    );
  }

  get configPath() {
    return _AppConfiguration_configPath.get(this);
  }

  /**
   * Absolute path to config.json inside {@link configPath}. Derived from the
   * config module rather than re-joining the name here, so the menu that opens
   * the file cannot drift from the loader that reads it.
   * @returns {string}
   */
  get configFilePath() {
    return require("../config").getConfigFilePath(this.configPath);
  }

  get startupConfig() {
    return _AppConfiguration_startupConfig.get(this);
  }

  get legacyConfigStore() {
    return _AppConfiguration_legacyConfigStore.get(this);
  }

  get settingsStore() {
    return _AppConfiguration_settingsStore.get(this);
  }

  get customThemes() {
    return this.#customThemes;
  }

  // Resolve once per launch, including missing-theme fallback. The saved
  // selection below can change, but the running app keeps its startup CSS.
  get customCSSPath() {
    return this.#customCSSPath;
  }

  get isWatchingConfigFile() {
    return require("../config").isWatchingConfigFile(this.startupConfig);
  }

  get themeSelection() {
    return this.#themeSelection ?? {
      cssName: this.startupConfig.customCSSName ?? this.startupConfig.appearance?.cssName ?? "",
      cssLocation: this.startupConfig.customCSSLocation ?? this.startupConfig.appearance?.cssLocation ?? "",
    };
  }

  // Theme selection is restart-only like appearance.cssName. Write only its
  // canonical fields; do not mutate startupConfig or migrate unrelated keys.
  // null chooses the existing direct CSS file; "" explicitly chooses Default.
  setThemeSelection(selection) {
    if (selection !== null && selection !== "" &&
        ![...BUILTIN_THEMES, ...this.#customThemes].some((theme) => theme.value === selection)) {
      throw new Error("Unknown theme selection");
    }
    const configFile = this.configFilePath;
    const data = fs.existsSync(configFile)
      ? JSON.parse(fs.readFileSync(configFile, "utf8")) : {};
    if (!isPlainObject(data) ||
        (Object.hasOwn(data, "appearance") && !isPlainObject(data.appearance))) {
      throw new Error("Cannot update an invalid configuration");
    }
    const before = JSON.stringify(data);
    const appearance = data.appearance ?? {};
    if (selection === null) {
      const cssLocation = appearance.cssLocation ?? data.customCSSLocation ?? this.themeSelection.cssLocation;
      if (typeof cssLocation !== "string" || !cssLocation) {
        throw new Error("No custom CSS file is configured");
      }
      appearance.cssLocation = cssLocation;
    } else if (selection === "") {
      appearance.cssLocation = "";
    }
    appearance.cssName = selection ?? "";
    data.appearance = appearance;
    const changed = before !== JSON.stringify(data);
    if (changed) {
      fs.mkdirSync(this.configPath, { recursive: true });
      // Preserve user config symlinks (common with dotfile managers), mode and
      // unrelated options. Rename atomically so a failed write cannot truncate it.
      const target = fs.existsSync(configFile) ? fs.realpathSync(configFile) : configFile;
      const mode = fs.existsSync(target) ? fs.statSync(target).mode & 0o777 : 0o600;
      const temp = path.join(path.dirname(target), `.config-theme-${process.pid}-${Date.now()}.tmp`);
      let written = false;
      try {
        fs.writeFileSync(temp, JSON.stringify(data, null, 2) + "\n", { flag: "wx", mode });
        written = true;
        fs.renameSync(temp, target);
      } finally {
        if (written && fs.existsSync(temp)) fs.unlinkSync(temp);
      }
    }
    this.#themeSelection = {
      cssName: appearance.cssName,
      cssLocation: appearance.cssLocation ?? data.customCSSLocation ?? this.themeSelection.cssLocation,
    };
    return changed;
  }
}

module.exports = { AppConfiguration };
