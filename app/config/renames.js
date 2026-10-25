// Flat-to-nested option renames from ADR-025, applied during the deprecation
// window. Pure data module, no Electron imports, mirroring validator.js and
// borrowing its isPlainObject rather than keeping a fourth copy of it.
//
// Both names work while a rename is in its window. The FLAT name stays the one
// every module reads, so no feature code is swept; a nested value is projected
// onto the flat key only when the user actually supplied it. The flat
// declarations, this table and the projection are deleted together at the end
// of the window (2.30.0, see issue #2842).
//
// `inverted` marks a rename that flips a boolean's polarity, for example
// `disableNotifications: true` becoming `notifications.enabled: false`. A plain
// copy would silently reverse user intent, so those must be negated.

// `type: "array"` restores the coercion the flat name gets for free. Nested
// leaves are not yargs options, so yargs never wraps a scalar into an array
// for them: `globalShortcuts: "Control+Shift+M"` arrives as ["Control+Shift+M"]
// while `shortcuts.global: "Control+Shift+M"` would arrive as a bare string,
// which fails the Array.isArray check in app/globalShortcuts/index.js and makes
// a for..of over disableGlobalShortcuts iterate characters or throw.
const { isPlainObject } = require("./validator");

/** @type {{flat: string, nested: string, inverted?: boolean, type?: string}[]} */
const RENAMES = [
  // Batch 1 (2.17.0)
  { flat: "globalShortcuts", nested: "shortcuts.global", type: "array" },
  {
    flat: "disableGlobalShortcuts",
    nested: "shortcuts.disableWhileFocused",
    type: "array",
  },
  { flat: "clearStorageData", nested: "storage.clearData" },

  // Batch 2 (2.21.0). Every remaining rename whose target namespace is
  // brand new, taken in one pass because they share the batch 1 mechanics
  // exactly.
  //
  // customBackground
  { flat: "isCustomBackgroundEnabled", nested: "customBackground.enabled" },
  { flat: "customBGServiceBaseUrl", nested: "customBackground.serviceBaseUrl" },
  {
    flat: "customBGServiceConfigFetchInterval",
    nested: "customBackground.configFetchInterval",
  },
  // urlHandling
  { flat: "defaultURLHandler", nested: "urlHandling.defaultHandler" },
  { flat: "meetupJoinRegEx", nested: "urlHandling.meetupJoinRegEx" },
  {
    flat: "onNewWindowOpenMeetupJoinUrlInApp",
    nested: "urlHandling.openMeetupJoinInApp",
  },
  // incomingCalls
  { flat: "enableIncomingCallToast", nested: "incomingCalls.toast" },
  { flat: "incomingCallCommand", nested: "incomingCalls.command" },
  {
    flat: "incomingCallCommandArgs",
    nested: "incomingCalls.commandArgs",
    type: "array",
  },
  // appearance
  { flat: "customCSSName", nested: "appearance.cssName" },
  { flat: "customCSSLocation", nested: "appearance.cssLocation" },
  { flat: "followSystemTheme", nested: "appearance.followSystemTheme" },
  // platform
  { flat: "chromeUserAgent", nested: "platform.chromeUserAgent" },
  {
    flat: "emulateWinChromiumPlatform",
    nested: "platform.emulateWindowsChromium",
  },
  {
    flat: "spellCheckerLanguages",
    nested: "platform.spellCheckerLanguages",
    type: "array",
  },
  { flat: "disableTimestampOnCopy", nested: "platform.disableTimestampOnCopy" },
  // app
  { flat: "appTitle", nested: "app.title" },
  { flat: "url", nested: "app.url" },
  { flat: "partition", nested: "app.partition" },
  // window
  { flat: "frame", nested: "window.frame" },
  { flat: "menubar", nested: "window.menubar" },
  { flat: "minimized", nested: "window.minimized" },
  { flat: "closeAppOnCross", nested: "window.closeOnCross" },
  { flat: "minimizeOnClose", nested: "window.minimizeOnClose" },
  { flat: "alwaysOnTop", nested: "window.alwaysOnTop" },
  { flat: "class", nested: "window.class" },
  // tray
  { flat: "trayIconEnabled", nested: "tray.enabled" },
  { flat: "appIcon", nested: "tray.icon" },
  { flat: "appIconType", nested: "tray.iconType" },
  { flat: "useMutationTitleLogic", nested: "tray.useMutationTitleLogic" },
  // performance
  { flat: "disableGpu", nested: "performance.disableGpu" },
  {
    flat: "electronCLIFlags",
    nested: "performance.electronCLIFlags",
    type: "array",
  },
  // development
  { flat: "webDebug", nested: "development.webDebug" },
  { flat: "watchConfigFile", nested: "development.watchConfigFile" },

  // Batch 3 (2.29.0). The renames into the namespaces that already shipped
  // unrelated leaves. They waited on gate A in issue #2842 (yargs replacing an
  // object option wholesale, so moving one leaf in dropped its siblings'
  // defaults), which mergeDefaults.js fixed in #3011.
  //
  // notifications
  {
    flat: "disableNotifications",
    nested: "notifications.enabled",
    inverted: true,
  },
  {
    flat: "disableNotificationSound",
    nested: "notifications.sound.enabled",
    inverted: true,
  },
  {
    flat: "disableNotificationSoundIfNotAvailable",
    nested: "notifications.sound.onlyWhenAvailable",
  },
  {
    flat: "disableNotificationWindowFlash",
    nested: "notifications.windowFlash",
    inverted: true,
  },
  {
    flat: "disableBadgeCount",
    nested: "notifications.badgeCountEnabled",
    inverted: true,
  },
  { flat: "notificationMethod", nested: "notifications.method" },
  { flat: "defaultNotificationUrgency", nested: "notifications.urgency" },
  // idleDetection
  { flat: "awayOnSystemIdle", nested: "idleDetection.setAwayOnIdle" },
  { flat: "appIdleTimeout", nested: "idleDetection.timeout" },
  {
    flat: "appIdleTimeoutCheckInterval",
    nested: "idleDetection.checkInterval.detectIdle",
  },
  {
    flat: "appActiveCheckInterval",
    nested: "idleDetection.checkInterval.detectActive",
  },
  // auth
  { flat: "authServerWhitelist", nested: "auth.serverWhitelist" },
  { flat: "ssoBasicAuthUser", nested: "auth.basic.user" },
  { flat: "ssoBasicAuthPasswordCommand", nested: "auth.basic.passwordCommand" },
  { flat: "clientCertPath", nested: "auth.clientCertificate.path" },
  { flat: "clientCertPassword", nested: "auth.clientCertificate.password" },
  {
    flat: "customCACertsFingerprints",
    nested: "auth.customCACertificateFingerprints",
    type: "array",
  },
  // network
  { flat: "proxyServer", nested: "network.proxyServer" },
];

// Reads a dotted path, tolerating a missing intermediate object.
function readPath(source, path) {
  let node = source;
  for (const part of path.split(".")) {
    if (node === null || typeof node !== "object") return undefined;
    node = node[part];
  }
  return node;
}

// yargs turns the strings "true" and "false" into booleans for a declared
// boolean option, so negating the raw value would invert the wrong thing:
// "false" is truthy, and !"false" is false, the opposite of what the user
// wrote. A boolean leaf carrying a boolean raises no validator warning either,
// so this would be a silent flip rather than a reported type mismatch.
function toBoolean(value) {
  if (value === "false") return false;
  if (value === "true") return true;
  return Boolean(value);
}

// Mirrors the coercion yargs would have applied to the flat option: an array
// option given a scalar is wrapped, and an inverted boolean is negated.
function coerce(value, inverted, type) {
  if (inverted) return !toBoolean(value);
  if (type === "array" && !Array.isArray(value)) return [value];
  return value;
}

/**
 * Projects nested values onto their flat counterparts, in place.
 *
 * Presence is decided against the raw config file rather than the resolved
 * config. applyObjectDefaults in mergeDefaults.js fills every unset leaf of an
 * object option with its declared default (gate A in issue #2842), so in the
 * resolved config no leaf is ever `undefined`, and projecting from it would
 * write those defaults over the flat value the user actually set.
 *
 * @param {Record<string, unknown>} config the parsed yargs config, mutated.
 * @param {Record<string, unknown>} configFile the merged system and user
 *   config file contents; a nested path present here was set by the user.
 * @param {typeof RENAMES} renames override for tests.
 */
function applyRenamedOptions(config, configFile, renames = RENAMES) {
  if (!config || typeof config !== "object") return;

  for (const { flat, nested, inverted, type } of renames) {
    const value = readPath(configFile, nested);
    if (value === undefined) continue;

    // The new name wins when both are supplied; it is the canonical one.
    config[flat] = coerce(value, inverted, type);
  }
}

/**
 * Every `--flag` token yargs accepts for a flat option name.
 *
 * yargs' camel-case expansion means `--disableGpu` and `--disable-gpu` are the
 * same option, and boolean negation adds `--no-` in front of both. A probe over
 * all 84 declared options confirmed this decamelisation matches the alias yargs
 * generates for each of them.
 *
 * The `[A-Z]` class has no quantifier and cannot backtrack, so matching is
 * linear in the length of the name.
 *
 * @param {string} flat the flat option name.
 * @returns {string[]} the accepted tokens, without any `=value` suffix.
 */
function argvSpellings(flat) {
  const kebab = flat.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
  const names = kebab === flat ? [flat] : [flat, kebab];
  return names.flatMap((name) => [`--${name}`, `--no-${name}`]);
}

/**
 * Whether the user supplied an option, under either spelling and by whichever
 * route that spelling actually works.
 *
 * Only needed where behaviour turns on an option being *set* rather than on its
 * value, which today is `disableGpu` alone: app/startup/commandLine.js
 * force-disables the GPU on Wayland unless the user has said otherwise, so
 * someone opting back in through the new `performance.disableGpu` name has to
 * count as having spoken. Reading the resolved config cannot answer this, since
 * a declared default is indistinguishable from a user-supplied value there.
 *
 * The scopes differ on purpose and match applyRenamedOptions. In the config file
 * both names work, so both count. On the command line only the flat name works,
 * in any of the spellings yargs accepts for it (see argvSpellings), because the
 * projection above never looks at argv; counting `--performance.disableGpu`
 * there would report the user as having spoken while their value stayed
 * unprojected, leaving the Wayland branch to respect a default it mistook for a
 * choice.
 *
 * @param {Record<string, unknown>} configFile the merged system and user config
 *   file contents.
 * @param {string[]} argv process.argv, for the command line form of the flat
 *   name.
 * @param {string} flat the flat option name.
 * @returns {boolean}
 */
function isOptionSetByUser(configFile, argv, flat) {
  const rename = RENAMES.find((entry) => entry.flat === flat);
  const fileNames = rename ? [flat, rename.nested] : [flat];

  if (fileNames.some((name) => readPath(configFile, name) !== undefined)) {
    return true;
  }

  // Match the whole token, not a prefix: `--disableGpuFoo` is a different
  // option to yargs and leaves `disableGpu` at its default, so counting it
  // would report a choice the user never made. Splitting on the first `=`
  // covers `--disableGpu=false`; `--disableGpu false` is already two tokens.
  const spellings = argvSpellings(flat);
  return (
    Array.isArray(argv) &&
    argv.some((arg) => spellings.includes(arg.split("=")[0]))
  );
}

/**
 * Reads an option, in flat terms, from the electron-store that menu toggles
 * persist to. That store is the user's own config.json, so it can hold either
 * spelling; the nested one wins, matching applyRenamedOptions, and is coerced
 * back to the flat polarity (negation is symmetric).
 *
 * @param {{has: Function, get: Function}} store an electron-store, which
 *   resolves dotted keys as nested paths.
 * @param {string} flat the flat option name modules read.
 * @param {typeof RENAMES} renames override for tests.
 * @returns {unknown} the stored value, or undefined when neither is stored.
 */
function readStoredOption(store, flat, renames = RENAMES) {
  const rename = renames.find((entry) => entry.flat === flat);
  if (rename && store.has(rename.nested)) {
    return coerce(store.get(rename.nested), rename.inverted, rename.type);
  }
  return store.has(flat) ? store.get(flat) : undefined;
}

/**
 * Persists a flat-named value set from a menu under its nested name and drops
 * the flat key. Writing the flat key instead would lose to a nested value
 * already in config.json on the next start, so the toggle would silently
 * revert, and it would also add a deprecated key the user never wrote.
 *
 * @param {{has: Function, set: Function, delete: Function}} store an
 *   electron-store over the user's config.json.
 * @param {string} flat the flat option name modules read.
 * @param {unknown} value the value in flat terms.
 * @param {typeof RENAMES} renames override for tests.
 */
function writeStoredOption(store, flat, value, renames = RENAMES) {
  const rename = renames.find((entry) => entry.flat === flat);
  if (!rename) {
    store.set(flat, value);
    return;
  }
  store.set(rename.nested, coerce(value, rename.inverted, rename.type));
  if (store.has(flat)) store.delete(flat);
}

/**
 * Rewrites a config file's flat keys onto their nested targets, the inverse of
 * applyRenamedOptions. Never mutates the input.
 *
 * `coerce` serves both directions: negation is symmetric, and an array-typed
 * option needs wrapping on the way out for the same reason as on the way in.
 * Where both spellings are present the nested one is kept, matching runtime
 * precedence.
 *
 * Values otherwise move verbatim, which is not what yargs does. A flat option
 * declares a type, so yargs turns `"clearStorageData": "false"` into boolean
 * `false`; the nested leaf is undeclared and stays the truthy string. Callers
 * should run the result through validator.js, which reports type mismatches,
 * rather than assume the two files resolve alike.
 *
 * @param {Record<string, unknown>} configFile the USER config file, not the
 *   system-and-user merge from index.js: migrating that and writing it back as
 *   the user file would copy /etc values in, turning per-key admin policy into
 *   a whole-namespace user override.
 * @param {typeof RENAMES} renames override for tests.
 * @returns {Record<string, unknown>} a new config file object.
 */
function toNestedConfigFile(configFile, renames = RENAMES) {
  if (!isPlainObject(configFile)) return {};

  const result = structuredClone(configFile);

  for (const { flat, nested, inverted, type } of renames) {
    // Object.hasOwn, matching validator.js, so an inherited key cannot match.
    if (!Object.hasOwn(result, flat)) continue;

    const parts = nested.split(".");
    const leaf = parts.pop();

    let node = result;
    let reachable = true;
    for (const part of parts) {
      if (!Object.hasOwn(node, part)) node[part] = {};
      else if (!isPlainObject(node[part])) {
        reachable = false;
        break;
      }
      node = node[part];
    }

    // A namespace occupied by a non-object is the user's to fix; leave the
    // flat key rather than clobber it.
    if (!reachable) continue;

    if (!Object.hasOwn(node, leaf)) {
      node[leaf] = coerce(result[flat], inverted, type);
    }
    delete result[flat];
  }

  return result;
}

module.exports = {
  RENAMES,
  readPath,
  applyRenamedOptions,
  isOptionSetByUser,
  readStoredOption,
  writeStoredOption,
  toNestedConfigFile,
};
