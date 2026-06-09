// Schema-driven, warn-only validation of the user-provided config file
// (issue #2597, Phase 4 of the documentation-and-config-ux research).
//
// This is a pure data module with no Electron imports. It compares the parsed
// config file content against the option definitions from ./options.js and
// returns human-readable warning strings. It never throws and never rejects a
// config: unknown keys and bad types are reported, then ignored by yargs.
//
// PII safety (see CLAUDE.md): warnings must NEVER contain config VALUES, as
// they can hold URLs, tokens or email addresses. Only key names, type names
// and the public `choices` lists are safe to include.

const MAX_NESTED_DEPTH = 8;

function typeName(value) {
  if (Array.isArray(value)) return "array";
  if (value === null) return "null";
  return typeof value;
}

function matchesType(value, expectedType) {
  switch (expectedType) {
    case "array":
      return Array.isArray(value);
    case "object":
      return value !== null && typeof value === "object" && !Array.isArray(value);
    case "string":
    case "number":
    case "boolean":
      return typeof value === expectedType;
    default:
      // Unknown declared type — nothing sensible to check.
      return true;
  }
}

function isPrimitive(value) {
  return value === null || (typeof value !== "object" && typeof value !== "function");
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function unknownKeyWarning(name) {
  return `Unknown config option "${name}" — it will be ignored (it may belong to a different app version; see the configuration reference)`;
}

function typeMismatchWarning(name, expectedType, actualType) {
  return `Config option "${name}" should be type "${expectedType}" but got "${actualType}"`;
}

// Opportunistic nested validation using the Phase 3a `fields` metadata
// (a map of dot-path relative to the option → { type, describe }).
// Absence or malformed metadata silently skips this check.
function validateNestedFields(optionName, value, fields, warnings) {
  const fieldPaths = Object.keys(fields);

  const walk = (relativePath, node, depth) => {
    if (depth > MAX_NESTED_DEPTH) return;

    for (const [childKey, childValue] of Object.entries(node)) {
      const childPath = relativePath ? `${relativePath}.${childKey}` : childKey;
      const fullName = `${optionName}.${childPath}`;
      const fieldDef = fields[childPath];

      if (isPlainObject(fieldDef)) {
        if (fieldDef.type && !matchesType(childValue, fieldDef.type)) {
          warnings.push(typeMismatchWarning(fullName, fieldDef.type, typeName(childValue)));
        }
        continue;
      }

      const isIntermediatePrefix = fieldPaths.some((p) => p.startsWith(`${childPath}.`));
      if (!isIntermediatePrefix) {
        warnings.push(unknownKeyWarning(fullName));
      } else if (isPlainObject(childValue)) {
        walk(childPath, childValue, depth + 1);
      } else {
        warnings.push(typeMismatchWarning(fullName, "object", typeName(childValue)));
      }
    }
  };

  walk("", value, 0);
}

// Validates a parsed config file object against the option definitions.
// Returns an array of warning strings (empty when clean or when the input is
// not a usable object). Warn-only: never throws, never exits.
function validateConfigFile(configFile, optionDefinitions) {
  const warnings = [];

  if (!isPlainObject(configFile) || !isPlainObject(optionDefinitions)) {
    return warnings;
  }

  try {
    for (const [key, value] of Object.entries(configFile)) {
      const def = optionDefinitions[key];

      if (!isPlainObject(def)) {
        warnings.push(unknownKeyWarning(key));
        continue;
      }

      if (def.type && !matchesType(value, def.type)) {
        warnings.push(typeMismatchWarning(key, def.type, typeName(value)));
        continue;
      }

      if (Array.isArray(def.choices) && isPrimitive(value) && !def.choices.includes(value)) {
        warnings.push(`Config option "${key}" must be one of [${def.choices.join(", ")}]`);
        continue;
      }

      if (def.type === "object" && isPlainObject(def.fields) && isPlainObject(value)) {
        validateNestedFields(key, value, def.fields, warnings);
      }
    }
  } catch {
    // A pathological config shape must never break startup — and the error
    // message could echo config values, so keep this warning generic.
    return ["Config file validation could not complete due to an internal error; skipping config checks"];
  }

  return warnings;
}

module.exports = { validateConfigFile };
