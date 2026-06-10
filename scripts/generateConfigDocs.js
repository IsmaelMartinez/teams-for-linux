#!/usr/bin/env node

/**
 * Configuration Documentation Generator
 *
 * Reads the single source of truth for the wrapper's config options
 * (app/config/options.js) and emits:
 *   - docs-site/static/config-schema.json   (machine-readable schema)
 *   - docs-site/docs/configuration-generated.md (human-readable reference)
 *
 * Each schema entry carries the option's name, type, default, description,
 * and `applyMode` ("live" = takes effect immediately, "restart" = requires an
 * app relaunch). Object options additionally carry `fields`: the nested leaf
 * settings as `{ path, type, default, description, choices? }`, where `path`
 * is a dot-path relative to the option and `default` is derived by walking
 * that path through the option's default object.
 *
 * Before writing anything, the script lints the source schema for
 * completeness (missing describe/type/applyMode, object options without
 * `fields`, fields entries without type/describe) and exits non-zero with
 * "config schema lint:" messages on any violation. CI runs this script and
 * diffs the committed output, so a lint failure or stale output fails the
 * build.
 *
 * Run after changing an option in app/config/options.js. CI runs this and
 * fails if the committed output differs (drift guard), so the docs and the
 * schema can never fall out of sync with the code.
 *
 * Usage: node scripts/generateConfigDocs.js
 */

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const options = require(path.join(ROOT, "app", "config", "options.js"));

const SCHEMA_OUTPUT = path.join(ROOT, "docs-site", "static", "config-schema.json");
const DOCS_OUTPUT = path.join(ROOT, "docs-site", "docs", "configuration-generated.md");

const APPLY_MODES = new Set(["live", "restart"]);

// The chromeUserAgent default embeds process.versions.chrome, which changes on
// every Electron bump (and is "undefined" under plain Node). Normalise it to a
// stable placeholder so the generated output is deterministic.
function normaliseDefault(name, value) {
  if (name === "chromeUserAgent" && typeof value === "string") {
    return value.replace(/Chrome\/[^\s]*/, "Chrome/<version>");
  }
  return value;
}

function normaliseDescription(text) {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

// Leaf defaults are derived (not declared) so they can never drift from the
// option's `default` object. Returns undefined if any segment is absent.
function deriveFieldDefault(defaultValue, dotPath) {
  let current = defaultValue;
  for (const segment of dotPath.split(".")) {
    if (current === null || typeof current !== "object") {
      return undefined;
    }
    current = current[segment];
  }
  return current;
}

// Returns a list of schema-completeness violations (empty when complete).
function lintOptions() {
  const violations = [];
  for (const name of Object.keys(options)) {
    const def = options[name];
    if (!def.describe || !String(def.describe).trim()) {
      violations.push(`option "${name}" is missing a describe`);
    }
    if (!def.type) {
      violations.push(`option "${name}" is missing a type`);
    }
    if (def.applyMode === undefined) {
      violations.push(`option "${name}" is missing applyMode`);
    } else if (!APPLY_MODES.has(def.applyMode)) {
      violations.push(
        `option "${name}" has invalid applyMode "${def.applyMode}" (must be "live" or "restart")`,
      );
    }
    if (def.type === "object") {
      if (!def.fields || Object.keys(def.fields).length === 0) {
        violations.push(`object option "${name}" is missing a non-empty fields map`);
      }
    }
    for (const fieldPath of Object.keys(def.fields ?? {})) {
      const field = def.fields[fieldPath];
      if (!field.type) {
        violations.push(`option "${name}" field "${fieldPath}" is missing a type`);
      }
      if (!field.describe || !String(field.describe).trim()) {
        violations.push(`option "${name}" field "${fieldPath}" is missing a describe`);
      }
    }
  }
  return violations;
}

function buildSchema() {
  const list = [];
  for (const name of Object.keys(options)) {
    const def = options[name];
    const entry = {
      name,
      type: def.type ?? null,
      default: normaliseDefault(name, def.default),
      description: normaliseDescription(def.describe),
      applyMode: def.applyMode ?? null,
    };
    if (def.fields) {
      // Keep fields in source order so the output stays deterministic.
      entry.fields = Object.keys(def.fields).map((fieldPath) => {
        const field = def.fields[fieldPath];
        const fieldEntry = {
          path: fieldPath,
          type: field.type ?? null,
          default: deriveFieldDefault(def.default, fieldPath),
          description: normaliseDescription(field.describe),
        };
        if (field.choices) {
          fieldEntry.choices = field.choices;
        }
        return fieldEntry;
      });
    }
    list.push(entry);
  }
  return list;
}

function renderDefaultCell(value) {
  // JSON.stringify gives quoted strings ("web", ""), serialised objects/arrays,
  // and bare numbers/booleans, which matches the existing docs convention.
  const rendered = value === undefined ? "undefined" : JSON.stringify(value);
  // Escape pipes so the value stays inside one Markdown table cell.
  return "`" + rendered.replace(/\|/g, "\\|") + "`";
}

function renderDescriptionCell(text) {
  // The description is rendered as prose (not inside a code span). HTML-encode
  // the characters that would otherwise be misparsed: angle brackets in
  // placeholder tokens like <userData> would be read as JSX by MDX, and a raw
  // pipe would end the table cell. Escape the ampersand first so the entities
  // below are not double-encoded.
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\|/g, "&#124;");
}

function renderApplyCell(applyMode) {
  return applyMode ? "`" + applyMode + "`" : "";
}

function generateMarkdown(schema) {
  let md = `# Configuration Options Reference (Auto-Generated)

:::note
This page is auto-generated by \`scripts/generateConfigDocs.js\` from \`app/config/options.js\`, the single source of truth for the wrapper's configuration. Do not edit it by hand. After changing an option, run \`npm run generate-config-docs\` and commit the result.
:::

For configuration examples, file locations, and platform-specific notes, see the [Configuration Options](configuration.md) guide. This reference lists every option the wrapper defines, with its type, default, description, and apply mode. The **Apply** column tells you when a change takes effect: \`live\` means immediately, \`restart\` means the app must be relaunched.

**Total options**: ${schema.length}

| Option | Type | Default | Description | Apply |
|--------|------|---------|-------------|-------|
`;
  for (const opt of schema) {
    const type = opt.type ? "`" + opt.type + "`" : "";
    md += `| \`${opt.name}\` | ${type} | ${renderDefaultCell(opt.default)} | ${renderDescriptionCell(opt.description)} | ${renderApplyCell(opt.applyMode)} |\n`;
  }

  const objectOptions = schema.filter((opt) => opt.fields && opt.fields.length > 0);
  if (objectOptions.length > 0) {
    md += `
## Nested fields (object options)

Object options group several related settings. The tables below list each nested field with its type and the default derived from the option's default object.
`;
    for (const opt of objectOptions) {
      md += `
### ${opt.name}

| Field | Type | Default | Description |
|-------|------|---------|-------------|
`;
      for (const field of opt.fields) {
        const type = field.type ? "`" + field.type + "`" : "";
        md += `| \`${opt.name}.${field.path}\` | ${type} | ${renderDefaultCell(field.default)} | ${renderDescriptionCell(field.description)} |\n`;
      }
    }
  }

  md += `
---

*Generated by \`scripts/generateConfigDocs.js\` from \`app/config/options.js\`.*
`;
  return md;
}

function main() {
  const violations = lintOptions();
  if (violations.length > 0) {
    for (const violation of violations) {
      console.error(`config schema lint: ${violation}`);
    }
    console.error(
      `config schema lint: ${violations.length} violation(s) in app/config/options.js; no output written.`,
    );
    process.exit(1);
  }

  const schema = buildSchema();

  fs.mkdirSync(path.dirname(SCHEMA_OUTPUT), { recursive: true });
  const schemaJson = JSON.stringify(
    {
      $generatedBy: "scripts/generateConfigDocs.js",
      source: "app/config/options.js",
      optionCount: schema.length,
      options: schema,
    },
    null,
    2,
  );
  fs.writeFileSync(SCHEMA_OUTPUT, schemaJson + "\n", "utf8");

  fs.writeFileSync(DOCS_OUTPUT, generateMarkdown(schema), "utf8");

  console.log(`Generated ${schema.length} options:`);
  console.log(`  ${path.relative(ROOT, SCHEMA_OUTPUT)}`);
  console.log(`  ${path.relative(ROOT, DOCS_OUTPUT)}`);
}

main();
