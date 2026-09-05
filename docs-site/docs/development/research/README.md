# Research Documentation

This directory contains research, analysis, and strategic insights generated during the development and improvement of Teams for Linux.

:::info Research Context
These documents capture in-depth analysis and strategic insights that inform development decisions and provide context for major features.
:::

## Contents

Everything listed here describes work that has **not** fully shipped. Once a piece of research is fully implemented or rejected, its decision moves to an [ADR](../adr/README.md) and the research document is deleted, with git history preserving the investigation.

### Open Work

- **[Documentation, Contributing, and Config UX](documentation-and-config-ux-research.md)**, `app/config/options.js` as the single source of truth feeding generated docs, an in-app settings UI, and startup validation ([#2597](https://github.com/IsmaelMartinez/teams-for-linux/issues/2597))
  - **Phases 0 to 2 shipped (v2.12.0)**: drift fixes ([PR #2602](https://github.com/IsmaelMartinez/teams-for-linux/pull/2602)), generated config reference plus `config-schema.json` with CI drift guard ([PR #2604](https://github.com/IsmaelMartinez/teams-for-linux/pull/2604)), interactive config explorer in the docs site ([PR #2606](https://github.com/IsmaelMartinez/teams-for-linux/pull/2606))
  - **Phases 3a and 4 implemented**: per-option `applyMode` and nested-field metadata with a hard-failing generator lint, plus warn-only startup validation in `app/config/validator.js`
  - **Remaining**: Phase 3b, the in-app settings window, now unblocked by the 3a schema metadata

### Implemented Features (Research Removed)

Research documents are deleted once a feature is fully shipped and the document provides no ongoing reference value. The ADRs and git history preserve the decisions and context.

| Feature | Version | Reference |
|---------|---------|-----------|
| Graph API Integration | v2.6.17 | Phase 1 shipped ([PR #1958](https://github.com/IsmaelMartinez/teams-for-linux/pull/1958)); token route recorded in [ADR-030](../adr/030-graph-api-teams-session-token.md), implementation reference in app/graphApi/README.md; Phases 2 and 3 parked in the roadmap |
| Custom Stickers | v2.11.0 | Local-folder MVP plus HTTPS URL import and a one-level subfolder scan shipped ([#2476](https://github.com/IsmaelMartinez/teams-for-linux/issues/2476), [PR #2550](https://github.com/IsmaelMartinez/teams-for-linux/pull/2550)); the closed Telegram and GIPHY attempts and the untried generation idea are recorded in the roadmap |
| FIDO2 Touch Prompt | v2.18.0 | Prompt shown around the security-key call, with a Cancel that aborts the fido2 child; decision folded into [ADR-021](../adr/021-webauthn-fido2-linux.md) ([#2631](https://github.com/IsmaelMartinez/teams-for-linux/issues/2631), [PR #2779](https://github.com/IsmaelMartinez/teams-for-linux/pull/2779)) |
| System Performance Audit | --- | Ten findings closed as fixed, fixed differently, or not planned. Decision in [ADR-026](../adr/026-performance-audit-outcomes.md) |
| Configuration Organization | --- | Decision-only closeout (no feature shipped): naming convention and the resolved flat-to-nested rename mapping now live in [ADR-025](../adr/025-config-option-naming-convention.md); migration stays opportunistic, `docs-site/static/config-schema.json` is the live inventory |
| Smartcard / NSS PIN Dialog | v2.14.0 | Opt-in PIN dialog behind `auth.clientCertificate.pinDialog.enabled`, built on `app/_shared/securePrompt.js`. Decision in [ADR-024](../adr/024-smartcard-pkcs11-pin-dialog.md) ([#2639](https://github.com/IsmaelMartinez/teams-for-linux/issues/2639)) |
| Custom Notification System | v2.6.16 | Phase 1 toast shipped, Phase 2 notification centre dropped as unverifiable. Decision in [ADR-022](../adr/022-custom-notification-toast-scope.md) |
| Release Automation Tooling | --- | release-please adopted, release-it and Beads rejected. Decision in [ADR-023](../adr/023-release-automation-tooling.md) |
| WebAuthn / FIDO2 Hardware Keys | --- | Opt-in beta behind `auth.webauthn.enabled`; the implementation plan is superseded by [ADR-021](../adr/021-webauthn-fido2-linux.md) |
| MQTT Extended Status | v2.10.0 onwards | Microphone, camera, screen-sharing and incoming-call topics plus Home Assistant auto-discovery all shipped; the roadmap carries the per-PR status |
| Join Meeting Window Takeover | --- | Same-origin navigation plus the `Return to Teams` menu item (`app/menus/index.js`) ([#2322](https://github.com/IsmaelMartinez/teams-for-linux/issues/2322)) |
| MQTT Microphone State | v2.10.0 | Speaking-indicator driven microphone state (speaking/silent/muted/off) published to MQTT. See [PR #2497](https://github.com/IsmaelMartinez/teams-for-linux/pull/2497) |
| Notification Sound Player (inline replacement for `node-sound`) | v2.7.10 | Phase 1 of the notification-sound research shipped — `paplay`/`pw-play`/`aplay`/`afplay` detection in `app/audio/player.js`. See [PR #2306](https://github.com/IsmaelMartinez/teams-for-linux/pull/2306) |
| Cross-Distro CI Smoke Test | v2.7.x | Workflow `.github/workflows/cross-distro-smoke.yml` ships the design proposed in the original research. Umbrella decision in [ADR-016](../adr/016-cross-distro-testing-environment.md) |
| Electron 41 Upgrade | v2.8.0 | Repo skipped Electron 40 entirely and jumped 39.8.2 → 41.x via dependabot [PR #2347](https://github.com/IsmaelMartinez/teams-for-linux/pull/2347), with follow-up bumps to 41.5.0; the Electron 40 migration research is therefore obsolete |
| Issue-PR Release Linking | v2.7.11 | GraphQL `closingIssuesReferences` query; `closes:` metadata in changelog files. See [PR #2317](https://github.com/IsmaelMartinez/teams-for-linux/pull/2317) |
| Codebase Review (March 2026) | v2.7.x | Code quality, maintainability, performance, and DX review; findings addressed incrementally |
| Issue Triage Bot | v2.7.x | All four phases implemented; migrated to standalone Go service. See [ADR-018](../adr/018-issue-triage-bot-github-app-migration.md) and [github-issue-triage-bot](https://github.com/IsmaelMartinez/github-issue-triage-bot) |
| Dependency Cleanup | v2.7.10 | Removed `node-sound`, `lodash`, `electron-positioner`; project now has 6 production deps |
| Speaking Indicator | v2.7.11 | WebRTC `getStats()` for three-state mute/speaking detection. See [PR #2299](https://github.com/IsmaelMartinez/teams-for-linux/pull/2299) |
| Electron-Updater Auto-Update | v2.7.6 | [ADR-011](../adr/011-appimage-update-info.md); research covered electron-updater integration |
| External Changelog Generation | v2.7.x | [ADR-005](../adr/005-ai-powered-changelog-generation.md); fork detection + release automation shipped |
| Screen Lock Media Privacy | --- | Closed ([#2106](https://github.com/IsmaelMartinez/teams-for-linux/issues/2106)); no user interest; work preserved in branch |
| Tray Icon Logout Indicator | --- | Archived ([#1987](https://github.com/IsmaelMartinez/teams-for-linux/issues/1987)); user not responding; work preserved in branch |
| External Browser Authentication | --- | Not feasible; Teams manages OAuth internally ([#2017](https://github.com/IsmaelMartinez/teams-for-linux/issues/2017)) |
| GNOME Search Provider | --- | Not recommended; latency too high for acceptable UX ([#2075](https://github.com/IsmaelMartinez/teams-for-linux/issues/2075)) |
| Code Quality Hardening (Phases 1-3) | v2.7.5 | Logging hygiene, resilience, input handling, IPC hardening, CI/CD gates |
| Wayland/X11 Ozone Platform | v2.7.4 | Force X11 by default due to Electron 38+ Wayland regressions; re-affirmed June 2026 after [#2601](https://github.com/IsmaelMartinez/teams-for-linux/pull/2601) and [#2508](https://github.com/IsmaelMartinez/teams-for-linux/issues/2508) were closed, decision now in [ADR-031](../adr/031-ozone-platform-x11-default.md) |
| Quick Chat / Chat Modal | v2.7.4 | [ADR-014](../adr/014-quick-chat-deep-link-approach.md), [ADR-015](../adr/015-quick-chat-inline-messaging.md) |
| PII Log Sanitization | v2.7.2 | [ADR-013](../adr/013-pii-log-sanitization.md) |
| DOM Access Restoration | v2.5.2 | Hybrid API + DOM approach for React compatibility |
| Architecture Modernization | --- | Rejected (DDD too complex) --- incremental refactoring adopted instead |
| MQTT Commands | v2.6.x | Bidirectional MQTT support for toggle-mute, toggle-video, etc. |
| Calendar Data Export | v2.6.x | MQTT `get-calendar` command |
| useSystemPicker | --- | Rejected --- [ADR-008](../adr/008-usesystempicker-electron-38.md) |

## Purpose

These documents capture strategic insights, comprehensive analysis, research findings, and context that inform development decisions and provide rationale for major features.

## Document Lifecycle

Research documents follow this lifecycle:

1. **Active Research Phase**: Document findings, analysis, and recommendations
2. **Decision Phase**: Use research to inform final decisions (implemented or rejected)
3. **Archive Phase**: Move content to appropriate location after decision:
   - **Implemented features**: Create ADR if significant, update feature docs, delete research
   - **Rejected features**: Create/update ADR with concise decision record, delete research
   - **Superseded research**: Close with reference to superseding document
4. **History**: Git commit history preserves full investigation context

## Contributing Research

When adding new research documents:

1. **Follow naming convention**: Use descriptive, kebab-case filenames
2. **Include context**: Date, scope, and purpose of analysis
3. **Link related documents**: Cross-reference relevant files
4. **Update this index**: Add entries for new research documents
5. **Provide actionable outcomes**: Include clear recommendations or decisions

## Related Documentation

- [Configuration Options](../../configuration.md) - Application configuration reference
- [IPC API](../ipc-api.md) - Developer integration documentation
- [Architecture Decision Records](../adr/README.md) - Formal architectural decisions
- [Development Roadmap](../plan/roadmap.md) - Future development plans
