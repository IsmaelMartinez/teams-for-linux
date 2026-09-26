// Deep merge for object options (gate A in issue #2842). Pure data module, no
// Electron imports, so it can be unit tested directly.
//
// yargs treats an object option as a single value: a config file or CLI flag
// that sets one leaf replaces the whole declared default, so
// `{"network":{"webRTCIPHandlingPolicy":"..."}}` drops `network.disableQuic`
// and silently re-enables QUIC. The same shallow replacement happened between
// the /etc system config and the user config.
const { isPlainObject } = require("./validator");
const { RENAMES, readPath } = require("./renames");

/**
 * Merges `override` onto `base` without mutating either. Plain objects merge
 * recursively; arrays, scalars and null replace, so an explicit `false` or
 * `null` from the user always wins and a list is never concatenated.
 *
 * @param {unknown} base the lower-precedence value.
 * @param {unknown} override the higher-precedence value.
 * @returns {unknown}
 */
function deepMerge(base, override) {
  if (!isPlainObject(base) || !isPlainObject(override)) {
    return structuredClone(override === undefined ? base : override);
  }
  const result = structuredClone(base);
  for (const [key, value] of Object.entries(override)) {
    // JSON.parse keeps "__proto__" as an own key; assigning it would swap the
    // prototype and hide the value from the config validator.
    if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
    result[key] = deepMerge(base[key], value);
  }
  return result;
}

/**
 * Merges the /etc system config and the user config, user first.
 *
 * A renamed option has two spellings, and applyRenamedOptions projects the
 * nested one over the flat one. So when the user sets either spelling, both
 * are dropped from the system file first; otherwise a system
 * `urlHandling.defaultHandler` would override a user `defaultURLHandler`.
 *
 * @param {Record<string, unknown>} systemConfig
 * @param {Record<string, unknown>} userConfig
 * @returns {Record<string, unknown>}
 */
function mergeConfigFiles(systemConfig, userConfig) {
  const system = structuredClone(systemConfig);
  for (const { flat, nested } of RENAMES) {
    if (!Object.hasOwn(userConfig, flat) && readPath(userConfig, nested) === undefined) {
      continue;
    }
    delete system[flat];
    const parts = nested.split(".");
    const parent = readPath(system, parts.slice(0, -1).join("."));
    if (isPlainObject(parent)) delete parent[parts.at(-1)];
  }
  return deepMerge(system, userConfig);
}

// A dotted CLI flag such as `--network.disableQuic=false` reaches us as the
// string "false", because the leaf is not a declared yargs option. That string
// is truthy, so it is coerced back where the leaf is a boolean: either its
// declared default is one, or the option's `fields` metadata says so (leaves
// like overrideConstraints.echoCancellation have no default).
function coerceBooleans(option, value, path = "") {
  if (isPlainObject(value)) {
    const result = { ...value };
    for (const key of Object.keys(result)) {
      result[key] = coerceBooleans(option, result[key], path ? `${path}.${key}` : key);
    }
    return result;
  }
  if (value !== "true" && value !== "false") return value;
  const isBoolean =
    typeof readPath(option.default, path) === "boolean" ||
    option.fields?.[path]?.type === "boolean";
  return isBoolean ? value === "true" : value;
}

/**
 * Fills every object option in the parsed config with the declared defaults
 * of the leaves the user did not set. Mutates `config`.
 *
 * yargs stores each option under its camelCase name and a kebab-case alias
 * (`cacheManagement` and `cache-management`); both are updated so they cannot
 * disagree.
 *
 * @param {Record<string, unknown>} config the parsed yargs config.
 * @param {Record<string, {default?: unknown}>} options the declared options.
 */
function applyObjectDefaults(config, options) {
  for (const [name, option] of Object.entries(options)) {
    if (!isPlainObject(option.default) || !isPlainObject(config[name])) {
      continue;
    }
    const merged = deepMerge(option.default, coerceBooleans(option, config[name]));
    const kebab = name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
    config[name] = merged;
    if (kebab !== name && Object.hasOwn(config, kebab)) config[kebab] = merged;
  }
}

module.exports = { deepMerge, applyObjectDefaults, mergeConfigFiles };
