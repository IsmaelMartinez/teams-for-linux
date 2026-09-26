// Deep merge for object options (gate A in issue #2842). Pure data module, no
// Electron imports, so it can be unit tested directly.
//
// yargs treats an object option as a single value: a config file or CLI flag
// that sets one leaf replaces the whole declared default, so
// `{"network":{"webRTCIPHandlingPolicy":"..."}}` drops `network.disableQuic`
// and silently re-enables QUIC. The same shallow replacement happened between
// the /etc system config and the user config.
const { isPlainObject } = require("./validator");

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
    return override === undefined ? structuredClone(base) : override;
  }
  const result = structuredClone(base);
  for (const [key, value] of Object.entries(override)) {
    result[key] = deepMerge(base[key], value);
  }
  return result;
}

// A dotted CLI flag such as `--network.disableQuic=false` reaches us as the
// string "false", because the leaf is not a declared yargs option. That string
// is truthy, so it is coerced back where the declared default is a boolean.
function coerceToDefaultType(defaults, value) {
  if (!isPlainObject(defaults) || !isPlainObject(value)) {
    if (typeof defaults === "boolean" && (value === "true" || value === "false")) {
      return value === "true";
    }
    return value;
  }
  const result = { ...value };
  for (const key of Object.keys(result)) {
    result[key] = coerceToDefaultType(defaults[key], result[key]);
  }
  return result;
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
    const merged = deepMerge(
      option.default,
      coerceToDefaultType(option.default, config[name])
    );
    const kebab = name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
    config[name] = merged;
    if (kebab !== name && Object.hasOwn(config, kebab)) config[kebab] = merged;
  }
}

module.exports = { deepMerge, applyObjectDefaults };
