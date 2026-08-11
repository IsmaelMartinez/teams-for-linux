// Schema-driven, warn-only validation of the user-provided config file
// (issue #2597, Phase 4). Pure data module, no Electron imports.
//
// PII safety (see CLAUDE.md): warnings must NEVER contain config VALUES, as
// they can hold URLs, tokens or email addresses. Only key names, type names
// and the public `choices` lists are safe to include.

const MAX_NESTED_DEPTH = 8;
const MAX_NAMESPACE_HINT_NAMES = 4;

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

// ADR-025 rename hints: when the unknown key is the planned future name of a
// flat option (`renamedTo` metadata), point the user back at today's name.
function futureNameWarning(name, target) {
  const invertNote = target.inverts
    ? " (note: the meaning is inverted, use the opposite boolean value)"
    : "";
  return `Unknown config option "${name}" — this is the planned future name of "${target.name}" and is not implemented yet; use "${target.name}" instead${invertNote}`;
}

// Hint for an unknown top-level key that is the root namespace of one or more
// planned rename targets (e.g. a `tray` object written before it exists).
function futureNamespaceWarning(name, flatNames) {
  const shown = flatNames
    .slice(0, MAX_NAMESPACE_HINT_NAMES)
    .map((flatName) => `"${flatName}"`)
    .join(", ");
  const remaining = flatNames.length - MAX_NAMESPACE_HINT_NAMES;
  const more = remaining > 0 ? ` and ${remaining} more` : "";
  return `Unknown config option "${name}" — it is a planned future namespace that is not implemented yet; the "${name}.*" names map to the current options ${shown}${more}`;
}

// Selects the message for an unknown key: exact rename target, rename
// namespace root, or the generic warning. Nested dot-paths can never hit the
// roots branch (roots are single segments), so both unknown-key call sites
// share this selector safely.
function unknownKeyHint(name, { targets, roots }) {
  const target = targets.get(name);
  if (target) {
    return futureNameWarning(name, target);
  }
  if (roots.has(name)) {
    return futureNamespaceWarning(name, roots.get(name));
  }
  return unknownKeyWarning(name);
}

// Builds the ADR-025 rename lookups in one linear pass over the definitions:
// - targets: full renamedTo dot-path → { name, inverts } of the flat option
// - roots: the target's first segment → flat option names under that root
// Maps (not plain objects) so a literal "__proto__" key can't cause trouble,
// and Object.hasOwn so a polluted Object.prototype.renamedTo is ignored.
function buildRenameTargets(optionDefinitions) {
  const targets = new Map();
  const roots = new Map();
  for (const [optionName, def] of Object.entries(optionDefinitions)) {
    if (
      !isPlainObject(def) ||
      !Object.hasOwn(def, "renamedTo") ||
      typeof def.renamedTo !== "string" ||
      def.renamedTo === ""
    ) {
      continue;
    }
    targets.set(def.renamedTo, {
      name: optionName,
      inverts: Object.hasOwn(def, "renameInverts") && def.renameInverts === true,
    });
    const dotIndex = def.renamedTo.indexOf(".");
    if (dotIndex > 0) {
      const root = def.renamedTo.slice(0, dotIndex);
      if (!roots.has(root)) {
        roots.set(root, []);
      }
      roots.get(root).push(optionName);
    }
  }
  return { targets, roots };
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
function validateOption(name, value, def, warnings, getRenameLookup) {
  if (def.type && !matchesType(value, def.type)) {
    warnings.push(typeMismatchWarning(name, def.type, typeName(value)));
  } else if (violatesChoices(def, value)) {
    warnings.push(choicesWarning(name, def.choices));
  } else if (def.type === "object" && isPlainObject(def.fields) && isPlainObject(value)) {
    validateNestedFields(name, value, def.fields, warnings, getRenameLookup);
  }
}

// Opportunistic nested validation using the Phase 3a `fields` metadata
// (a map of dot-path relative to the option → { type, describe }).
// Absence or malformed metadata silently skips this check.
function validateNestedFields(optionName, value, fields, warnings, getRenameLookup) {
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
        validateOption(fullName, childValue, fieldDef, warnings, getRenameLookup);
      } else if (!fieldPaths.some((p) => p.startsWith(`${childPath}.`))) {
        warnings.push(unknownKeyHint(fullName, getRenameLookup()));
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

  // Rename lookups are only needed on the unknown-key path, so they are
  // built lazily (at most once per call) by buildRenameTargets above.
  let renameLookup = null;
  const getRenameLookup = () => {
    renameLookup ??= buildRenameTargets(optionDefinitions);
    return renameLookup;
  };

  try {
    for (const [key, value] of Object.entries(configFile)) {
      const def = Object.hasOwn(optionDefinitions, key)
        ? optionDefinitions[key]
        : undefined;

      if (isPlainObject(def)) {
        validateOption(key, value, def, warnings, getRenameLookup);
      } else {
        warnings.push(unknownKeyHint(key, getRenameLookup()));
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
