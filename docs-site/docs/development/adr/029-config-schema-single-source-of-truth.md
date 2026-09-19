---
id: 029-config-schema-single-source-of-truth
---

# ADR 029: Configuration Schema as Single Source of Truth

## Status

✅ Accepted (2026-09-05); phases 0 to 2, 3a and 4 all shipped in v2.12.0 (3a/4 via [PR #2642](https://github.com/IsmaelMartinez/teams-for-linux/pull/2642)), 3b (settings window) open

## Context

The documentation and config UX research (since deleted; see Related for its git history) found `configuration.md` hand-mirrored the yargs option definitions inline in `app/config/index.js` — `app/config/options.js` did not exist until Phase 1 extracted it ([PR #2604](https://github.com/IsmaelMartinez/teams-for-linux/pull/2604), 2026-06-01) — with no codegen link or "keep in sync" banner. The drift was real: the documented `msTeamsProtocols` default had gone stale, and `mqtt.homeAssistant.*` plus `auth.webauthn.debug` had no docs rows at all. `scripts/generateIpcDocs.js` already generated `ipc-api-generated.md` from code comments with a "do not edit" banner; configuration had no equivalent.

The research also mapped three `AppConfiguration` stores: `startupConfig` (immutable-intended, though menu toggles mutate it today), `settingsStore` for app-owned state outside the schema, and `legacyConfigStore`, which already layers persisted overrides over file config at boot — the only existing "persist, then apply over file config at startup" precedent, and the pattern a future settings UI should reuse.

Rather than another hand-written pass, the research proposed treating the option definitions as the schema itself, with docs, a future settings UI, and validation as derived consumers, mirroring the IPC precedent.

## Decision

`app/config/options.js` is the single schema. Three consumers derive from it:

1. The generated configuration reference and `docs-site/static/config-schema.json`, produced by `scripts/generateConfigDocs.js`. CI (`build.yml`) reruns `npm run generate-config-docs` and diffs `configuration-generated.md` and `config-schema.json` against committed output, failing the build on drift.
2. The interactive docs config explorer (`docs-site/src/components/ConfigExplorer`), fed by `config-schema.json` — a docs-site-only artifact, with docs-normalised defaults (e.g. `chromeUserAgent`'s Chrome version rewritten to a placeholder) and a flattened `fields` map. Nothing under `app/` reads it; a future settings window will read `app/config/options.js` directly, as `app/config/index.js` and `migrateFile.js` already do.
3. Startup validation in `app/config/validator.js`, which checks a loaded config file's keys against the schema for type, `choices`, and (via each object option's `fields` map) nested-leaf shape.

Two schema dimensions were added as the prerequisite for anything beyond documentation. Every option carries an `applyMode` of `live` or `restart` (documented in `app/config/options.js`'s header): `restart` is the default for anything without a verified live re-read path, `live` is reserved for the handful that already push a `config-changed` delta at runtime. Object-typed options carry a `fields` map describing each nested leaf's type and description, so a settings UI is not left rendering an opaque blob for anything past a flat boolean. `scripts/generateConfigDocs.js` lints the schema before writing anything — a missing `describe`, `type`, or `applyMode`, an invalid `applyMode` value, an empty `fields` map, or a nested field missing `type`/`describe` — failing with a `config schema lint:` message and non-zero exit, so an incomplete option fails CI rather than relying on reviewer vigilance.

Startup validation stays warn-only and never hard-fails on an unknown key, since a config file can be shared across app versions or intentionally hold keys a build does not recognize; it is a diagnostic at that boundary, not a gate.

The settings window (Phase 3b) is not built. `contextIsolation`/`sandbox` are disabled on the Teams window, so it must be a separate hardened `BrowserWindow` on `app/_shared/createDialogWindow.js` (both `true`), not a panel inside it. Its write channel goes in the `app/security/ipcValidator.js` allowlist; `sanitizePayload` there already recurses to a depth cap of 10, deleting `__proto__`/`constructor`/`prototype` at every level — the gaps are first-argument-only sanitisation and no sender check on the allowlist. The handler needs an `event.sender` check against the window's `webContents` (precedent: `app/webauthn/touchPrompt.js`, `app/mainAppWindow/profileViewManager.js`), schema type/`choices` validation, and a relaunch prompt for restart-required saves. Persisted edits must merge into config where system and user files already merge, in `app/config/index.js`, before `CommandLineManager.addSwitchesAfterConfigLoad` reads restart-only values (`proxyServer`, `network.disableQuic`, `disableGpu`) into command-line switches at module load — merging at app-ready instead, as `legacyConfigStore` feeds `config` today, would be too late.

## Consequences

### Positive

A single edit to `app/config/options.js` now propagates to the reference docs, `config-schema.json`, the docs explorer, and startup validation, which already reads this schema every launch (`app/config/index.js`); it will reach the settings window the same way once 3b ships, closing the class of bug that motivated this decision. The generator's lint makes schema completeness self-enforcing: an option missing `describe`, `type`, or `applyMode` fails CI outright. Reusing the IPC docs precedent means contributors who already know that workflow have one fewer pattern to learn. The ADR-025 rename mapping is applied by code, but via its own hand-written `RENAMES` table in `app/config/renames.js`, not derived from this schema; `migrateFile.js` uses `options.js` only to validate the migrated output. That table is the one deliberate parallel list the schema work allows, pinned against `options.js` by `tests/unit/configRenames.test.js`.

### Negative

The `applyMode`/`fields` investment (Phase 3a) shipped no user-visible feature on its own; it exists to make Phase 3b possible. Startup validation only warns, so a real mistake produces a log line, not a startup failure — deliberate, but it means the schema does not catch every user error. Most substantially, the thesis is not complete: there is still no in-app editor, and users hand-edit `config.json` across three platform-specific paths until Phase 3b ships. The curated `configuration.md` table ("Configuration Options Reference", roughly 140 hand-written rows) is a residual hand-maintained mirror outside the CI guard, which only diffs `configuration-generated.md`/`config-schema.json`: [PR #2945](https://github.com/IsmaelMartinez/teams-for-linux/pull/2945) hand-edited it alongside `options.js` as recently as 2026-09-03, and it collapses several object options into one row apiece instead of the per-leaf rows the generated reference lists (e.g. `media.macPerformanceMode` has none of its own). Replacing it with the generated reference is the open follow-up. Startup validation, the deprecation warning, and the rename projection also inspect only the config file, never CLI flags or environment variables; those users get no warning or projection once a flat name is removed at 2.30.0 (a known limitation in `app/config/deprecation.js`).

### Neutral

The settings window's security work, a dedicated hardened window with sender-gated writes, is why it is scoped as its own high-risk phase rather than folded into the schema work, and why restart-required options ship first, ahead of the live-apply subset and object-typed forms. `config-schema.json` is now a documented, generator-produced artifact other tooling can depend on, raising the bar for changing its shape casually.

## Alternatives Considered

### Versioned docs
Rejected: release-please ships frequently and the app auto-updates, so nearly all readers are current; a version switcher would add ongoing maintenance for marginal benefit.

### Migrating the docs platform to Starlight or Nextra
Rejected: Docusaurus 3.10 already provides offline search, MDX with React, Mermaid diagrams, and a working static GitHub Pages deploy; migrating would re-solve solved problems for no reader-visible win.

### Runtime in-process auto-migration of `config.json`
Rejected: silently rewriting a user's config file at boot is too risky for a file users hand-edit and often keep in version control. An opt-in, user-invoked codemod is preferable, and one shipped in v2.19.0 as the Settings menu's "Show Updated Config…" entry ([#2913](https://github.com/IsmaelMartinez/teams-for-linux/issues/2913), [PR #2914](https://github.com/IsmaelMartinez/teams-for-linux/pull/2914), [PR #2915](https://github.com/IsmaelMartinez/teams-for-linux/pull/2915)): it rewrites the user's flat keys onto their ADR-025 nested targets, writes the result unconditionally to `config.migrated.json` alongside the original, then shows a dialog listing what was renamed — review happens after the write, not as a diff before it — and never touches `config.json` itself. The startup deprecation warning points users at that entry only when the Settings menu is actually reachable (`isMigrationMenuAvailable`: `menubar` not `"hidden"`, or the tray icon enabled).

### Enabling Docusaurus `mdx1CompatDisabledByDefault`
Rejected: HTML-comment support in `.md` files is governed by this `future.v4` flag, not `fasterByDefault` (already satisfied by the `@docusaurus/faster` dependency). Disabling MDX v1 compatibility would force rewriting HTML comments to JSX across existing pages for no reader-visible benefit.

### A full dependency-aware config wizard
Rejected as scope creep for now: the docs explorer ships read, filter, and copy first, and conditional validation across gated option groups is deferred until users actually ask for it.

## Related

- [ADR-025](025-config-option-naming-convention.md): owns option naming and the flat-to-nested rename mapping; this ADR builds on it and does not restate it
- [#2597](https://github.com/IsmaelMartinez/teams-for-linux/issues/2597), the umbrella issue for this thesis
- [PR #2602](https://github.com/IsmaelMartinez/teams-for-linux/pull/2602) (Phase 0 drift fixes), [PR #2604](https://github.com/IsmaelMartinez/teams-for-linux/pull/2604) (Phase 1 generator, `config-schema.json`, CI drift guard), [PR #2606](https://github.com/IsmaelMartinez/teams-for-linux/pull/2606) (Phase 2 docs config explorer), [PR #2642](https://github.com/IsmaelMartinez/teams-for-linux/pull/2642) (Phase 3a/4 schema metadata, generator lint, startup validation)
- [#2842](https://github.com/IsmaelMartinez/teams-for-linux/issues/2842), the flat-to-nested config migration this schema work makes possible
- [#2913](https://github.com/IsmaelMartinez/teams-for-linux/issues/2913), [PR #2914](https://github.com/IsmaelMartinez/teams-for-linux/pull/2914) and [PR #2915](https://github.com/IsmaelMartinez/teams-for-linux/pull/2915): the opt-in migration codemod and its "Show Updated Config…" Settings entry
- Research history: see git history for `docs-site/docs/development/research/documentation-and-config-ux-research.md`
- `app/config/options.js`, `docs-site/static/config-schema.json`, `scripts/generateConfigDocs.js`, `app/config/validator.js`, `app/security/ipcValidator.js`
