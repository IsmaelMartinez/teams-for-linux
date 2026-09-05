---
id: 029-config-schema-single-source-of-truth
---

# ADR 029: Configuration Schema as Single Source of Truth

## Status

✅ Accepted (2026-09-05); phases 0 to 2 shipped in v2.12.0, 3a and 4 shipped, 3b (settings window) open

## Context

The documentation and config UX research (since deleted; see git history for `docs-site/docs/development/research/documentation-and-config-ux-research.md`) found that `configuration.md` mirrored the option definitions in `app/config/options.js` by hand, with no codegen link and no "keep in sync" banner. That drift was not hypothetical: the documented `msTeamsProtocols` default had gone stale against the code, and the `mqtt.homeAssistant.*` object plus `auth.webauthn.debug` existed in code with no rows in the docs at all. The project already had a working counter-example next door: `scripts/generateIpcDocs.js` generates `ipc-api-generated.md` from code comments with a "do not edit" banner, the pattern the IPC contributing guide points to. Configuration had no equivalent.

The research also mapped three separate configuration stores inside `AppConfiguration`: an immutable-intended `startupConfig` that is the runtime source of truth (though menu toggles mutate it in place today), a persistent `settingsStore` for app-owned state outside the option schema, and a `legacyConfigStore` that already layers a handful of persisted overrides on top of file config at boot. That third store is the only place in the codebase where "persist an edit, then apply it over the file config at startup" already exists, and any future settings UI needs exactly that precedence pattern rather than a new one.

Fixing the drift with another hand-written pass would only reset the clock, so the research argued for treating the option definitions themselves as the schema, with the docs, an eventual settings UI, and startup validation as generated or derived consumers of it, mirroring the IPC precedent rather than inventing a new mechanism.

## Decision

`app/config/options.js` is the single schema. Three consumers derive from it, and none hand-maintains a parallel copy:

1. The generated configuration reference and `docs-site/static/config-schema.json`, produced by `scripts/generateConfigDocs.js` and enforced in CI. The `build.yml` workflow reruns `npm run generate-config-docs` and diffs `docs-site/docs/configuration-generated.md` and `config-schema.json` against the committed output, failing the build on drift.
2. The interactive docs config explorer (`docs-site/src/components/ConfigExplorer`), fed by `config-schema.json`, and eventually an in-app settings window fed by the same artifact.
3. Startup validation in `app/config/validator.js`, which checks a loaded config file's keys against the schema for type, `choices`, and (via each object option's `fields` map) nested-leaf shape.

Two schema dimensions were added as the prerequisite for anything beyond documentation. Every option now carries an `applyMode` of `live` or `restart`, documented in the header of `app/config/options.js`: `restart` is the default for any option not verified to have a live re-read path, `live` is reserved for the handful that already push a `config-changed` delta at runtime. Object-typed options carry a `fields` map describing each nested leaf's own type and description, so a settings UI is not left rendering an opaque blob for anything more complex than a flat boolean. `scripts/generateConfigDocs.js` lints the schema before writing anything: a missing `describe`, `type`, or `applyMode`, or an object option with an empty `fields` map, fails the generator with a `config schema lint:` message and a non-zero exit, so an incomplete option fails CI rather than depending on reviewer vigilance.

Startup validation stays warn-only by design and never hard-fails on an unknown key, since a config file can be shared across app versions or intentionally hold keys a newer or older build does not recognize; validation belongs at that boundary as a diagnostic, not a gate.

The settings window (Phase 3b) is not built. When it is, it must persist edits to a dedicated override store layered over `startupConfig` at boot, the same shape `legacyConfigStore` already uses, rather than mutating the immutable-intended runtime config directly. Its single config-write IPC channel must be added to the allowlist in `app/security/ipcValidator.js`, and because `contextIsolation` and `sandbox` are both disabled for Teams DOM access, the write handler cannot rely solely on the shared `sanitizePayload` there: it needs its own deep rejection of `__proto__`, `constructor`, and `prototype` at every nesting level, plus type and `choices` checks against the schema, before accepting any write.

## Consequences

### Positive

A single edit to `app/config/options.js` now propagates to the reference docs, `config-schema.json`, and the docs explorer, and will reach the settings window and validator the same way once 3b ships, closing the class of bug that motivated this decision. The generator's lint makes schema completeness self-enforcing rather than reviewer-dependent: a PR that adds an option without `describe`, `type`, or `applyMode` fails CI outright. Reusing the IPC docs precedent also means contributors who already know that workflow have one fewer pattern to learn.

### Negative

The `applyMode` and `fields` investment (Phase 3a) shipped no user-visible feature on its own; it exists purely to make Phase 3b possible later. Startup validation only warns, so a config file with a real mistake produces a log line rather than a startup failure, which is deliberate but means the schema does not catch every user error automatically. Most substantially, the thesis is not yet complete: there is still no in-app editor, and users continue to hand-edit `config.json` across three platform-specific paths until Phase 3b ships.

### Neutral

The security work the settings window needs, a dedicated write channel plus independent deep sanitisation, is why it is scoped as its own high-risk phase rather than folded into the schema work, and why it is planned to ship restart-required options first, ahead of the live-apply subset and object-typed forms. `config-schema.json` is now a documented, generator-produced artifact other tooling can depend on, which raises the bar for changing its shape casually.

## Alternatives Considered

### Versioned docs
Rejected: release-please ships frequently and the app auto-updates, so nearly all readers are on the latest version; a version switcher would add ongoing maintenance for marginal benefit.

### Migrating the docs platform to Starlight or Nextra
Rejected: Docusaurus 3.10 already provides offline local search, MDX with React, Mermaid diagrams, and a working static GitHub Pages deploy; migrating would re-solve already-solved problems for no reader-visible win.

### Runtime in-process auto-migration of `config.json`
Rejected: silently rewriting a user's config file at boot is too risky for a file users hand-edit and often keep in version control. An opt-in, user-invoked codemod that prints a diff before writing is preferred instead.

### Enabling Docusaurus `fasterByDefault`
Rejected: it would force rewriting HTML comments to JSX across existing documentation pages for no reader-visible benefit.

### A full dependency-aware config wizard
Rejected as scope creep for now: the docs explorer ships read, filter, and copy first, and conditional validation across gated option groups is deferred until users actually ask for it.

## Related

- [ADR-025](025-config-option-naming-convention.md): owns option naming and the flat-to-nested rename mapping; this ADR builds on it and does not restate it
- [#2597](https://github.com/IsmaelMartinez/teams-for-linux/issues/2597), the umbrella issue for this thesis
- [PR #2602](https://github.com/IsmaelMartinez/teams-for-linux/pull/2602) (Phase 0 drift fixes), [PR #2604](https://github.com/IsmaelMartinez/teams-for-linux/pull/2604) (Phase 1 generator, `config-schema.json`, CI drift guard), [PR #2606](https://github.com/IsmaelMartinez/teams-for-linux/pull/2606) (Phase 2 docs config explorer)
- [#2842](https://github.com/IsmaelMartinez/teams-for-linux/issues/2842), the flat-to-nested config migration this schema work makes possible
- `app/config/options.js`, `docs-site/static/config-schema.json`, `scripts/generateConfigDocs.js`, `app/config/validator.js`, `app/security/ipcValidator.js`
