# Config Module

Handles loading configuration from `config.json` and parsing command-line arguments using `yargs`.

## Startup Validation

`validator.js` performs warn-only, schema-driven validation of the merged
(system + user) `config.json` contents at startup, using the option
definitions in `options.js` as the schema:

- Unknown top-level keys, type mismatches, and invalid `choices` values are
  reported as `[CONFIG]` warnings in the log.
- When an object option declares nested `fields` metadata, nested keys are
  validated the same way using dotted names (e.g. `mqtt.homeAssistant.enabled`).
- Validation never throws, never exits, and never rejects a config — invalid
  entries are simply ignored by yargs as before.
- Warnings contain only key names, type names, and allowed choices — never
  config values, which may contain URLs, tokens, or email addresses.

Deprecation warnings are handled separately in `index.js`
(`checkUsedDeprecatedValues`).

## Usage

View all available options:
```bash
teams-for-linux --help
```

## Configuration

See [`../../docs-site/docs/configuration.md`](../../docs-site/docs/configuration.md) for complete configuration documentation including:

- Configuration file locations and precedence
- All available options with defaults
- Feature-specific settings (custom backgrounds, certificates, cache management, etc.)
- Command-line argument examples
