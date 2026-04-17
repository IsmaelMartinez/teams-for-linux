---
id: 020-multi-account-profile-switcher
---

# ADR 020: Multi-Account Profile Switcher

## Status

✅ Proposed

## Context

Community demand for hosting multiple Microsoft 365 tenants inside a single running app instance has been consistent for 7+ years across issues [#72](https://github.com/IsmaelMartinez/teams-for-linux/issues/72), [#438](https://github.com/IsmaelMartinez/teams-for-linux/issues/438), [#1656](https://github.com/IsmaelMartinez/teams-for-linux/issues/1656), and [#1830](https://github.com/IsmaelMartinez/teams-for-linux/issues/1830). Users — typically consultants, MSPs, and multi-org employees — need to be logged into 3–10 tenants during a working day, and want parity with the official Windows Teams client's top-right avatar account switcher.

**Investigation Date:** 2026-04-16

**Today's workaround** (documented in `docs-site/docs/multiple-instances.md`) is the `--user-data-dir` CLI flag, optionally combined with `customUserDir` and per-tenant `--class` / `--appIcon` values. This works but is clunky:

- One tray icon per tenant instead of one unified icon
- Manual `.desktop` entry creation for every new tenant
- No cross-tenant notifications (inactive instances only notify when focused)
- Higher total memory than a shared process
- No in-app UX — the user's mental model is "six separate apps"

**Distinction from ADR-010:** ADR-010 rejected **multiple `BrowserWindow`s for a single account** (pop-out chats, floating meetings). This ADR proposes **multiple accounts inside a single `BrowserWindow`** — a fundamentally different problem with a compatible solution. The maintainer anticipated this distinction in [#72](https://github.com/IsmaelMartinez/teams-for-linux/issues/72):

> "Ideally we use BrowserViews inside one single BrowserWindow (to avoid memory going up to the roof), and have some sort of tabs"

The `BrowserView` API has since been superseded by `WebContentsView` (Electron 30+), which is the current recommendation and aligns with the ongoing Electron 41 baseline.

## Decision

**Adopt a single-`BrowserWindow` + one-`WebContentsView`-per-profile architecture.** The application remains a single window with a single tray icon, a single instance lock, and all existing ADR-010 invariants preserved.

- Each profile is bound to `session.fromPartition('persist:teams-profile-{uuid}', { cache: true })`; the partition UUID is generated once at profile creation (`crypto.randomUUID()`) and is immutable for the view's lifetime.
- All profile views are instantiated up front as children of `mainWindow.contentView`. Switching toggles visibility via `contentView.addChildView` / `removeChildView` and bounds updates — **no `loadURL` on switch**, so sessions stay warm, drafts survive, and the Teams websocket is not reconnected.
- Profile metadata is stored under `app.profiles` in the existing `settingsStore` (electron-store), not in user-facing `config.json`. Single-profile users are auto-bootstrapped on first launch: the legacy `persist:teams-4-linux` session becomes Profile 0 ("My account") with no login loss.

### Rationale

1. **Respects ADR-010's single-window invariant.** Still exactly one `BrowserWindow`, one tray icon, one instance lock. The feature is orthogonal to ADR-010's pop-out-chat rejection.

2. **Modern, supported Electron API.** `WebContentsView` is the current recommendation for in-window embedded web content (Electron 30+, full support in 41) and replaces the deprecated `BrowserView` and `<webview>` tag. Aligns with the ongoing Electron upgrade baseline.

3. **Proven production pattern.** ElectronIM (`manusa/electronim`, Apache-2.0) and Ferdium both ship this exact model. ElectronIM's `service-manager` is the closest reference implementation for teams-for-linux's architecture.

4. **Keeps sessions warm like the native Teams Windows client.** Switching is show/hide, not reload — matches Microsoft's own account-switcher UX so closely that users do not need a tutorial.

## Consequences

### Positive

- ✅ Unified tray icon with aggregated unread badge across all profiles (Phase 2)
- ✅ Single instance lock preserved; `--profile-id=<uuid>` flag extends the existing `second-instance` handler
- ✅ ADR-010 single-window invariant fully preserved
- ✅ UX parity with native Windows Teams client account switcher
- ✅ Zero regression for single-profile users — legacy `persist:teams-4-linux` is auto-migrated as Profile 0
- ✅ `--user-data-dir` / `customUserDir` workflows continue to work unchanged as an independent axis
- ✅ Switch latency under ~500ms (no websocket reconnect); drafts preserved

### Negative

- ⚠️ Memory footprint scales ~N × single-profile RSS with N warm profiles (mitigated in Phase 3 with optional Ferdium-style hibernation)
- ⚠️ `WebContentsView` is a newer API than `BrowserView`; community documentation is thinner and examples are fewer
- ⚠️ Nine new `profile-*` IPC channels to document and maintain in the `ipcValidator.js` allowlist
- ⚠️ Per-profile state audit required for today's module-level singletons (see `CLAUDE.profiles.md` § 6)
- ⚠️ New per-partition preload shim for cross-profile notification forwarding (Phase 2)

### Neutral

- Profile config lives in `settingsStore`, not `config.json` — the nested-config pattern the upstream roadmap prescribes for new features
- `customUserDir` continues to exist as an independent axis (each user-data-dir has its own `app.profiles` list)
- Does not preclude a future Microsoft PWA multi-window native feature — revisit ADR-010 separately if that lands

## Addressing ADR-010's Objections

ADR-010 raised seven concrete blockers for multi-window support. Each is resolved by the multi-`WebContentsView`-in-single-window design:

1. **"Single instance lock prevents multiple app instances"** → Preserved. The single instance lock is untouched. The existing `second-instance` handler (`app/index.js`) is extended to parse a `--profile-id=<uuid>` flag (and `msteams://` deep links in Phase 3); if present, switch to that profile instead of just re-focusing.

2. **"72 IPC channels designed for single-window communication"** → Preserved. There is still exactly one `BrowserWindow` and one top-level `webContents`. Per-profile state is scoped via `event.sender` → `WebContentsView` → partition lookup, not by trusting a renderer-supplied profile id. Most of the 72 channels remain single-window and need no changes.

3. **"17 browser tools assume single window context"** → Preserved. Each `WebContentsView` still runs with its own preload context, so per-view scoping falls out naturally — the tools continue to run in their own `webContents`, and the main process aggregates across them.

4. **"Which window's unread count shows in tray?"** → In Phase 1, the tray reflects the active profile only. In Phase 2, a `ProfileUnreadAggregator` in main sums `profile-unread` events from all partitions; the badge is the sum, the tooltip shows top-3 unread profiles by name.

5. **"How to handle call state across windows?"** → There is still only one window. Call state and the power save blocker (`app/mainAppWindow/browserWindowManager.js:237-259`) live on the active `WebContentsView`. Microsoft's own Windows client does not support concurrent meetings across tenants, so there is no new semantic to invent.

6. **"How to manage screen sharing state?"** → Active view only, matching today. The screen-preview window migrates from its hardcoded `persist:teams-for-linux-session` (`app/mainAppWindow/index.js:138,157`) to the active profile's partition per `CLAUDE.profiles.md` § 6, so starting a share from profile A cannot bleed into profile B.

7. **"Potential authentication/session conflicts"** → Electron `session.fromPartition` provides hard isolation of cookies, tokens, localStorage, IndexedDB, and service workers. ElectronIM and Ferdium have shipped this partition-per-account pattern in production for years against Microsoft, Google, and Slack web apps.

## Alternatives Considered

### Option 1: Multiple Independent `BrowserWindow`s

Run one `BrowserWindow` per tenant in the same process.

**Pros:**
- True OS-level window separation per tenant
- Conceptually simpler than embedded views

**Cons:**
- **Directly violates ADR-010.** Doubles IPC, tray, and auth surface area.
- Multiple tray icons or ambiguous tray ownership
- Forces the 72-channel refactor ADR-010 explicitly rejected

**Why rejected:** ADR-010 already said no to this shape, and the profile-switcher feature does not require it.

### Option 2: Reload Single Window Into Different Partitions Per Switch

Keep one `WebContentsView`; change its session partition on every switch by re-creating the view and calling `loadURL`.

**Pros:**
- Lowest steady-state memory (only one warm tenant at a time)
- Minimal architectural change

**Cons:**
- Full Teams sign-in + websocket reconnect on every switch (~5–10s)
- In-flight drafts, call state, and in-meeting context lost on switch
- Effectively the same UX as today's `--user-data-dir` workaround, just wrapped in chrome

**Why rejected:** Fails the core user story (`PRD.md` § 4) — users need near-instant switching with preserved drafts. This is what users are already complaining about.

### Option 3: Legacy `<webview>` Tags (Ferdium v1 / Rambox Classic)

Embed each tenant in a `<webview>` tag inside the renderer.

**Pros:**
- Familiar pattern in older Electron-app-shell projects

**Cons:**
- `<webview>` is discouraged in modern Electron and has weaker isolation than session partitions
- Notification-shim drift is well-documented across Ferdium's migration history
- No first-class session partition control from main

**Why rejected:** Deprecated direction; the industry (including Ferdium itself, in its v2 rewrite) has moved to `WebContentsView` for exactly these reasons.

## Migration Plan

- **First-launch bootstrap:** if `app.profiles` is empty and `persist:teams-4-linux` has any cookies or localStorage, create Profile 0 pointing at that exact partition string — existing login preserved byte-for-byte.
- **CLI flags:** `--user-data-dir`, `--class`, `--appIcon`, `--url`, `--customUserDir` behave identically. New `--profile-id=<uuid>` is additive.
- **`customUserDir` composes:** each `customUserDir` (or `--user-data-dir`) retains its own `app.profiles` list independently; the two axes are orthogonal.
- **User docs:** `docs-site/docs/multiple-instances.md` is updated to lead with the in-app switcher and retain CLI flows as the advanced option.
- **Single-profile regression check:** every PR description in the phased delivery confirms launching with an empty `app.profiles` produces byte-identical pre-feature behavior.

## Phased Delivery

- **Phase 1 — MVP:** per-profile `WebContentsView`s, top-right dropdown switcher, Profiles menu bar entry, first-run migration, nine `profile-*` IPC channels, per-profile migration of the `CLAUDE.profiles.md` § 6 shared-state singletons, and an E2E smoke test.
- **Phase 2 — Background notifications:** per-partition preload notification shim and unread-count tagging, aggregated tray badge, per-profile unread dots, `disableNotifications` and `muted` plumbing.
- **Phase 3 — Power features:** `--profile-id` CLI flag end-to-end, keyboard shortcut to cycle profiles, pinned-profile sidebar (max 3, matches Windows), drag-to-reorder.

## Related

- Issues: [#72](https://github.com/IsmaelMartinez/teams-for-linux/issues/72), [#438](https://github.com/IsmaelMartinez/teams-for-linux/issues/438), [#689/#690 `customUserDir`](https://github.com/IsmaelMartinez/teams-for-linux/pull/690), [#1656](https://github.com/IsmaelMartinez/teams-for-linux/issues/1656), [#1830](https://github.com/IsmaelMartinez/teams-for-linux/issues/1830), [#1984 ADR-010](https://github.com/IsmaelMartinez/teams-for-linux/issues/1984)
- ADRs: ADR-010 (scope distinction — this ADR does not revisit its rejection of pop-out windows)
- Files to be touched:
  - `app/mainAppWindow/browserWindowManager.js` — `WebContentsView` creation and bounds/visibility management
  - `app/partitions/manager.js` — extend (or sibling as `app/profiles/manager.js`) for profile CRUD + partition derivation
  - `app/security/ipcValidator.js` — allowlist the nine new `profile-*` channels
  - `app/login/index.js:5` — migrate module-level `isFirstLoginTry` to a per-partition `Map`
  - `app/index.js` — single-instance `second-instance` handler parses `--profile-id`
  - `app/mainAppWindow/index.js:138,157` — screen-preview partition derived from active profile
  - `docs-site/docs/multiple-instances.md` — user guidance shifted to in-app flow

## References

- [ElectronIM source: service-manager](https://github.com/manusa/electronim/blob/main/src/service-manager/index.js)
- [Ferdium Service model](https://github.com/ferdium/ferdium-app/blob/main/src/models/Service.ts)
- [Electron `WebContentsView` docs](https://www.electronjs.org/docs/latest/api/web-contents-view)
- [Electron `session.fromPartition`](https://www.electronjs.org/docs/latest/api/session#sessionfrompartitionpartition-options)
- [Microsoft: Activity in other accounts and orgs](https://learn.microsoft.com/en-us/microsoftteams/activity-in-other-accounts-orgs)
