// Schema-driven, warn-only validation of the user-provided config file
// (issue #2597, Phase 4). Pure data module, no Electron imports.
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
  // null conventionally means "unset, use the default" (e.g. the
  // network.webRTCIPHandlingPolicy default), so it is never a mismatch.
  if (value === null) return true;
  // Union types like "string|boolean" (logConfig levels accept false to
  // disable a transport) match when any component matches.
  if (expectedType.includes("|")) {
    return expectedType.split("|").some((t) => matchesType(value, t));
  }
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

function choicesWarning(name, choices) {
  return `Config option "${name}" must be one of [${choices.join(", ")}]`;
}

function violatesChoices(def, value) {
  return (
    Array.isArray(def.choices) &&
    value !== null &&
    isPrimitive(value) &&
    !def.choices.includes(value)
  );
}

// Shared by top-level options and nested leaves: leaf definitions carry no
// `fields`, so the recursion into validateNestedFields stops at them.
function validateOption(name, value, def, warnings) {
  if (def.type && !matchesType(value, def.type)) {
    warnings.push(typeMismatchWarning(name, def.type, typeName(value)));
  } else if (violatesChoices(def, value)) {
    warnings.push(choicesWarning(name, def.choices));
  } else if (def.type === "object" && isPlainObject(def.fields) && isPlainObject(value)) {
    validateNestedFields(name, value, def.fields, warnings);
  }
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
      // Object.hasOwn so a key literally named "__proto__" or "constructor"
      // is reported as unknown instead of resolving to an inherited property.
      const fieldDef = Object.hasOwn(fields, childPath) ? fields[childPath] : undefined;

      if (isPlainObject(fieldDef)) {
        validateOption(fullName, childValue, fieldDef, warnings);
      } else if (!fieldPaths.some((p) => p.startsWith(`${childPath}.`))) {
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

// Returns warning strings (empty when clean or input is unusable).
// Warn-only: never throws, never exits.
function validateConfigFile(configFile, optionDefinitions) {
  const warnings = [];

  if (!isPlainObject(configFile) || !isPlainObject(optionDefinitions)) {
    return warnings;
  }

  try {
    for (const [key, value] of Object.entries(configFile)) {
      const def = Object.hasOwn(optionDefinitions, key)
        ? optionDefinitions[key]
        : undefined;

      if (isPlainObject(def)) {
        validateOption(key, value, def, warnings);
      } else {
        warnings.push(unknownKeyWarning(key));
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
