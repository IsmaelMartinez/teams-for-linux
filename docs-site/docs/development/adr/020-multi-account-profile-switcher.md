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

- **Feature-flag gated.** The entire feature is opt-in via `multiAccount.enabled` in `config.json` (default `false`). When disabled, behavior is byte-identical to pre-feature single-profile operation. See § "Feature Flag & Scope" for the full contract.
- Each profile is bound to `session.fromPartition('persist:teams-profile-{uuid}')`; the partition UUID is generated once at profile creation (`crypto.randomUUID()`) and is immutable for the view's lifetime. The `persist:` prefix is what tells Electron to persist cookies and storage for that partition — the method's optional `options` second argument is not needed for this persistence behavior.
- All profile views are instantiated up front as children of `mainWindow.contentView`. Switching toggles visibility via `contentView.addChildView` / `removeChildView` and bounds updates — **no `loadURL` on switch**, so sessions stay warm, drafts survive, and the Teams websocket is not reconnected.
- Profile metadata is stored under `app.profiles` in the existing `settingsStore` (electron-store), not in user-facing `config.json`. When the feature flag is flipped on for the first time, the legacy `persist:teams-4-linux` session becomes Profile 0 ("My account") with no login loss.

### Rationale

1. **Respects ADR-010's single-window invariant.** Still exactly one `BrowserWindow`, one tray icon, one instance lock. The feature is orthogonal to ADR-010's pop-out-chat rejection.

2. **Modern, supported Electron API.** `WebContentsView` was introduced in Electron 30 and is the current recommendation for in-window embedded web content, replacing the deprecated `BrowserView` and `<webview>` tag. It is stable in the Electron 41 baseline this project runs on.

3. **Proven production pattern.** ElectronIM (`manusa/electronim`, Apache-2.0) and Ferdium both ship this exact model. ElectronIM's `service-manager` is the closest reference implementation for teams-for-linux's architecture.

4. **Keeps sessions warm like the native Teams Windows client.** Switching is show/hide, not reload — matches Microsoft's own account-switcher UX so closely that users do not need a tutorial.

## Feature Flag & Scope

The feature is opt-in and defaults to off. This section defines the exact boundaries.

### `multiAccount.enabled` (default `false`)

New `config.json` key, following the project's existing nested-config convention (`auth.intune.*`, `screenSharing.*`, `graphApi.*`, `mqtt.*`):

```json
{
  "multiAccount": {
    "enabled": false
  }
}
```

**When `false`:**

- No switcher UI, no `Profiles` menu bar entry.
- Single `persist:teams-4-linux` partition — byte-identical to current behavior.
- No bootstrap, no migration — `app.profiles` stays empty in `settingsStore`.
- Every existing CLI flag and code path behaves exactly as before the feature shipped.

**When `true`:**

- On first startup after the flag flips, the bootstrap runs: if `persist:teams-4-linux` has cookies or localStorage, Profile 0 ("My account") is created pointing at that partition, no re-login required.
- The switcher UI, `Profiles` menu bar entry, and keyboard shortcuts activate.

The regression check for every Phase 1 PR is that launching with `multiAccount.enabled === false` produces byte-identical pre-feature behavior, verified via E2E smoke test.

### Mutual exclusion with `auth.intune.enabled`

If both `auth.intune.enabled === true` and `multiAccount.enabled === true` at startup, the app logs a warning and forces multi-account off for that session:

```
[MultiAccount] auth.intune.enabled is true; multi-account is not supported in this configuration and will be disabled for this session.
```

The Linux D-Bus Microsoft Identity Broker has undocumented behavior around concurrent enrollments for different UPNs on one machine. Rather than spike and risk a validation dead-end, Phase 1 treats Intune as single-profile-only. Users who need both can track a follow-up issue; a Phase 2+ spike can revisit if demand materializes.

### Per-profile vs. shared settings

In Phase 1, only four fields live on each `Profile` record in `settingsStore`; everything else is global.

**Per-profile:**

| Field | Type | Purpose |
|-------|------|---------|
| `disableNotifications` | boolean | Silence this profile's notification badges and OS toasts (Phase 2 plumbing) |
| `muted` | boolean | Suppress audio cues from this profile (notification sounds, incoming-call ring) |
| `pinned` | boolean | Assigns a `Ctrl+Shift+N` keyboard shortcut; up to 5 pinned profiles |
| `url` | string, optional | Per-profile URL override for GovCloud (`https://gov.teams.microsoft.us/`) or dev endpoints; falls back to the global `url` config |

**Shared across all profiles (from `config.json` / CLI switches):**

Tray behavior, tray icon, notification sound, MQTT broker, custom background service URL, global shortcuts, proxy server, certificate fingerprints, custom user agent, all Electron command-line flags (`--user-data-dir`, `--class`, `--appIcon`, etc.).

This is a conscious MVP narrowing. Making any of the shared fields per-profile is deferred to a future phase if user feedback asks for it.

## User Experience

Four user-facing flows: first-run bootstrap, add, switch, remove. All are gated on `multiAccount.enabled === true`.

### First-run bootstrap (invisible to the user)

On the first launch **after** `multiAccount.enabled` is flipped to `true`, if `app.profiles` is empty and the legacy `persist:teams-4-linux` session has any cookies or localStorage, a **Profile 0** record is created with:

- `name`: "My account"
- `partition`: `persist:teams-4-linux` (the existing legacy partition — not a fresh UUID partition, so the user's login survives)
- `avatarColor`: deterministically derived from a hash of the partition string
- `avatarInitials`: "MA" (editable later)

The user sees exactly the same Teams view they had before the flag flipped. The switcher UI appears in the title bar, but with one entry. No re-login required.

### Add a profile

1. User clicks `Profiles → Add profile…` on the menu bar.
2. A modal dialog appears with fields:
   - **Name** (required — e.g. "Acme Corp", "HCS")
   - **URL override** (optional — defaults to the global `url` config; can be set to `https://gov.teams.microsoft.us/` for GovCloud or any dev endpoint)
   - **Initials** (optional, auto-derived from Name if blank)
   - **Color** (optional, random HSL if blank)
3. On save, a new `Profile` record is persisted with a fresh `persist:teams-profile-{uuid}` partition; a `WebContentsView` is created against that partition and the user is switched to it.
4. The view loads the Microsoft login page — same flow as today's `--user-data-dir` gives.

### Switch between profiles

**Mouse:** top-right dropdown in the title bar showing the active profile's initials/avatar. Clicking opens a compact picker listing all profiles (active one highlighted). Clicking a profile switches to it.

**Keyboard:** `Ctrl+Shift+1…5` jumps directly to pinned profile N (mirrors the Windows native Teams client). Up to 5 pinned profiles supported; pinned state is the per-profile `pinned` boolean.

**Mechanism:** switching toggles visibility via `mainWindow.contentView.addChildView` / `removeChildView` and bounds updates. **No `loadURL`** — the switched-away view stays in the view hierarchy but hidden. Sessions stay warm, drafts survive, the Teams websocket is not reconnected. Target: under 500 ms switch latency (verified by E2E timing assertion).

### Remove a profile

1. `Profiles → Manage…` opens a dialog listing all profiles with metadata and a remove action per row.
2. The currently active profile and the last remaining profile cannot be removed — the UI disables the action with a tooltip explaining why.
3. On confirmation, the profile's `persist:teams-profile-{uuid}` partition is cleared via `session.clearStorageData()` (cookies, tokens, cache, IndexedDB, service workers, localStorage); the `Profile` record is deleted from `settingsStore`; the `WebContentsView` is destroyed.
4. Confirmation dialog text: "This will permanently delete this profile's login and local data. If you re-add this profile later, Teams will need to re-authenticate."

### What does not change for users who don't enable the flag

The ADR's single most important contract: **with `multiAccount.enabled === false`, every user-visible behavior is identical to today.** No new menu entries, no new shortcuts, no new tray tooltip phrasing, no new logs at startup. The feature is invisible to the 95%+ of users who don't need it.

## Compatibility & Phase 1 Limitations

Audit of external integrations and shared subsystems, with explicit Phase 1 scope. This was run against `feat/multi-account-profiles` to give concrete answers rather than hand-waving.

| Area | Current implementation | Phase 1 status | Notes |
|------|------------------------|----------------|-------|
| **Intune MAM** (`app/intune/index.js`) | D-Bus Microsoft Identity Broker; module-level `inTuneAccount` singleton bound to `webContents.session` via `onBeforeSendHeaders`. | **Not supported** | Mutually exclusive with `multiAccount.enabled` — see § "Mutual exclusion with `auth.intune.enabled`". The D-Bus broker's concurrent-enrollment behavior is undocumented; deferring rather than spiking. |
| **Client certificate auth** | OS-owned (Chromium uses the system cert store); `app/certificate/index.js` validates against `config.customCACertsFingerprints` process-wide. | **Works as-is** | Fingerprint validation is config-driven and applies uniformly across all profiles. Client cert selection cannot be per-session in Electron — the OS handles it. |
| **Proxy server** (`--proxy-server` / `config.proxyServer`) | Process-global via `app.commandLine.appendSwitch`, applied before any window exists. | **Shared proxy only** | All profiles route through the same proxy. Per-profile proxy (via `session.setProxy()`) is explicitly not supported in Phase 1; deferred to a future phase if users request it. |
| **Proxy / auth login dialog** | Per-`webContents` (landed in PR #2435 — `WeakMap<webContents, isFirstTry>`). | **Works as-is** | Each profile's 401 challenge flows through its own `webContents.on("login")` with isolated state. |
| **MQTT** (`app/mqtt/*`) | Process-level, single broker connection. | **Works as-is** | One app → one broker → one status stream. Publishing is stateless per event. No per-profile split needed or desirable (the broker sees one "device" publishing one status). |
| **Custom background** (`app/customBackground/index.js`) | Module-level `customBGServiceUrl` + session-bound request handlers in `mainAppWindow`. | **Minor refactor (~10 LoC)** | `customBGServiceUrl` moves from module scope to instance field; `CustomBackground` is instantiated per profile view. Mechanical, low risk. |
| **Global shortcuts / tray** | App-level. | **Works as-is** | Operates on focused window; no per-profile conflict. |
| **Single instance lock** | App-level via `app.requestSingleInstanceLock()`. | **Preserved** | The `second-instance` handler gets a new `--profile-id=<uuid>` argument in Phase 3. |
| **Certificate fingerprint validation** | Process-global from `config.customCACertsFingerprints`. | **Works as-is** | Single config, single policy across all profiles. |
| **Notification system** | `NotificationService` + `CustomNotificationManager`, shared process-level. | **Works as-is (Phase 1); per-partition shim (Phase 2)** | Phase 1 uses the active profile's notifications only. Phase 2 adds a per-partition preload shim so background profiles can forward unread counts (see Phased Delivery). |

**Explicit Phase 1 non-goals**, documented so users who need them can stay on the single-profile path:

- Intune MAM alongside multi-account (blocked via startup mutex).
- Per-profile proxy servers (all profiles share the `proxyServer` config).
- Per-profile settings beyond the four listed in § "Per-profile vs. shared settings".
- Cross-profile notification aggregation (Phase 2).
- Per-profile URL defaults distinct from `config.url` (only the optional override on the `Profile` record).

Everything else is either already per-session by Electron's design, already process-level in a way that works fine for multi-account, or a small mechanical refactor called out in § "Shared-state audit".

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
- ⚠️ Six new Phase 1 `profile-*` IPC channels (`profile-list`, `profile-get-active`, `profile-switch`, `profile-add`, `profile-update`, `profile-remove`) to document and maintain in the `ipcValidator.js` allowlist, plus additional Phase 2+ channels for notification/mute/pinning as those land
- ⚠️ Per-profile state audit required for today's module-level singletons (enumerated under "Shared-state audit" in the Migration Plan; Phase 1 addresses two — login try-state and screen-preview partition — plus one small mechanical refactor in `CustomBackground`)
- ⚠️ Intune MAM is not supported alongside multi-account in Phase 1 (mutually exclusive at startup; see § "Feature Flag & Scope")
- ⚠️ All profiles share the globally configured proxy in Phase 1; per-profile proxy is deferred
- ⚠️ New per-partition preload shim for cross-profile notification forwarding (Phase 2)

### Neutral

- Profile config lives in `settingsStore`, not `config.json` — the nested-config pattern the upstream roadmap prescribes for new features
- `customUserDir` continues to exist as an independent axis (each user-data-dir has its own `app.profiles` list)
- Does not preclude a future Microsoft PWA multi-window native feature — revisit ADR-010 separately if that lands

## Addressing ADR-010's Objections

ADR-010 raised seven concrete blockers for multi-window support. Each is resolved by the multi-`WebContentsView`-in-single-window design:

1. **"Single instance lock prevents multiple app instances"** → Preserved. The single instance lock is untouched. The existing `second-instance` handler (registered in `app/index.js`, implemented as `exports.onAppSecondInstance` in `app/mainAppWindow/index.js`) is extended to parse a `--profile-id=<uuid>` flag (and `msteams://` deep links in Phase 3); if present, switch to that profile instead of just re-focusing.

2. **"72 IPC channels designed for single-window communication"** → Preserved. There is still exactly one `BrowserWindow` and one top-level `webContents`. Per-profile state is scoped via `event.sender` → `WebContentsView` → partition lookup, not by trusting a renderer-supplied profile id. Most of the 72 channels remain single-window and need no changes.

3. **"17 browser tools assume single window context"** → Preserved. Each `WebContentsView` still runs with its own preload context, so per-view scoping falls out naturally — the tools continue to run in their own `webContents`, and the main process aggregates across them.

4. **"Which window's unread count shows in tray?"** → In Phase 1, the tray reflects the active profile only. In Phase 2, a `ProfileUnreadAggregator` in main sums `profile-unread` events from all partitions; the badge is the sum, the tooltip shows top-3 unread profiles by name.

5. **"How to handle call state across windows?"** → There is still only one window. Call state and the power save blocker (`app/mainAppWindow/browserWindowManager.js:237-259`) live on the active `WebContentsView`. Microsoft's own Windows client does not support concurrent meetings across tenants, so there is no new semantic to invent.

6. **"How to manage screen sharing state?"** → Active view only, matching today. The screen-preview window migrates from its hardcoded `persist:teams-for-linux-session` (`app/mainAppWindow/index.js:138,157`) to the active profile's partition (see "Shared-state audit" in the Migration Plan), so starting a share from profile A cannot bleed into profile B.

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

### Shared-state audit

Several module-level singletons today assume a single account. Each must be scoped per-partition (or per-`WebContentsView`) before Phase 1 ships, otherwise switching profiles mid-flow will leak state between tenants:

| Location | Symptom if not migrated |
|----------|------------------------|
| `app/login/index.js` (`isFirstLoginTry`, module-level `let`) | Switching profile mid-login produces a false "already logged in" state; the second profile's first 401 is mistaken for a retry and triggers an app relaunch |
| `app/mainAppWindow/index.js:138,157` (screen-preview partition hardcoded to `persist:teams-for-linux-session`) | Screen share preview leaks across profiles — preview opened from profile A shows profile A's cookies/session even when profile B started the share |
| `app/mainAppWindow/index.js` (`cleanExpiredAuthCookies` called once at startup against a single partition) | Other profiles' expired auth cookies are never cleaned; only the startup-active profile benefits |
| Call state + power-save blocker (`app/mainAppWindow/browserWindowManager.js:237-259`) | Blocker outlives the profile that started the call — switching away from an in-call profile leaves the OS pinned awake under the new profile |
| Incoming call toast (`app/incomingCallToast/index.js`) | Toast raised from profile A can be dismissed (or answered) by profile B, because the toast has no notion of which partition produced it |

Phase 1 migrates the first entry (`isFirstLoginTry` → per-`webContents` `WeakMap`, already landed on the feat branch) and the second (screen-preview partition). Phases 2–3 address the remaining three as their corresponding features (aggregated unread, cross-profile call handling) come online.

## Phased Delivery

- **Phase 1 — MVP:** new `multiAccount.enabled` config flag (default `false`) with startup-time mutual-exclusion check against `auth.intune.enabled`, per-profile `WebContentsView`s, top-right dropdown switcher, `Profiles` menu bar entry with Add / Switch / Manage flows, `Ctrl+Shift+1…5` keyboard shortcuts for pinned profiles, first-run Profile 0 migration (gated on flag flip), the six Phase 1 `profile-*` IPC channels, migration of the first two shared-state items from the audit above (the `isFirstLoginTry` → per-`webContents` `WeakMap` conversion in `app/login/index.js`, and swapping the hardcoded screen-preview partition in `app/mainAppWindow/index.js` for the active profile's partition), a ~10 LoC refactor of `CustomBackground` so `customBGServiceUrl` lives on the instance rather than at module scope, and an E2E smoke test covering the byte-identical-when-disabled regression case. The remaining three audit entries (`cleanExpiredAuthCookies`, power-save blocker, incoming-call toast) defer to Phases 2–3 as their corresponding features (aggregated unread, cross-profile call handling) come online.
- **Phase 2 — Background notifications:** per-partition preload notification shim and unread-count tagging, aggregated tray badge, per-profile unread dots, `disableNotifications` and `muted` plumbing.
- **Phase 3 — Power features:** `--profile-id` CLI flag end-to-end, keyboard shortcut to cycle profiles, pinned-profile sidebar (max 5, exposing the `Ctrl+Shift+1…5` shortcuts introduced in Phase 1), drag-to-reorder.

## Related

- Issues: [#72](https://github.com/IsmaelMartinez/teams-for-linux/issues/72), [#438](https://github.com/IsmaelMartinez/teams-for-linux/issues/438), [#689/#690 `customUserDir`](https://github.com/IsmaelMartinez/teams-for-linux/pull/690), [#1656](https://github.com/IsmaelMartinez/teams-for-linux/issues/1656), [#1830](https://github.com/IsmaelMartinez/teams-for-linux/issues/1830), [#1984 ADR-010](https://github.com/IsmaelMartinez/teams-for-linux/issues/1984)
- ADRs: ADR-010 (scope distinction — this ADR does not revisit its rejection of pop-out windows)
- Files to be touched:
  - `app/config/defaults.js` — add the `multiAccount.enabled` default (`false`) plus any sub-keys (currently none)
  - `app/index.js` — startup-time mutual-exclusion check between `auth.intune.enabled` and `multiAccount.enabled`, plus ProfilesManager wiring (already landed on `feat/multi-account-profiles`)
  - `app/mainAppWindow/browserWindowManager.js` — `WebContentsView` creation and bounds/visibility management; gated on `multiAccount.enabled`
  - `app/partitions/manager.js` — extend (or sibling as `app/profiles/manager.js`) for profile CRUD + partition derivation
  - `app/security/ipcValidator.js` — allowlist the six Phase 1 `profile-*` channels (and later-phase additions as they land)
  - `app/login/index.js` — migrate module-level `isFirstLoginTry` to a per-`webContents` `WeakMap` (landed)
  - `app/mainAppWindow/index.js` — extend `exports.onAppSecondInstance` (where `processArgs` already runs) to parse `--profile-id` and switch before loading the URL (Phase 3)
  - `app/mainAppWindow/index.js:138,157` — screen-preview partition derived from active profile
  - `app/customBackground/index.js` — move `customBGServiceUrl` from module scope to instance field; instantiate one `CustomBackground` per profile view
  - New renderer HTML for the Add-profile and Manage-profiles dialogs (file names TBD, matching the existing `joinMeetingDialog` / `login` dialog pattern)
  - `docs-site/docs/configuration.md` — document the new `multiAccount.enabled` key
  - `docs-site/docs/multiple-instances.md` — user guidance shifted to in-app flow, with CLI flows retained as the advanced option

## References

- [ElectronIM source: service-manager](https://github.com/manusa/electronim/blob/main/src/service-manager/index.js)
- [Ferdium Service model](https://github.com/ferdium/ferdium-app/blob/main/src/models/Service.ts)
- [Electron `WebContentsView` docs](https://www.electronjs.org/docs/latest/api/web-contents-view)
- [Electron `session.fromPartition`](https://www.electronjs.org/docs/latest/api/session#sessionfrompartitionpartition-options)
- [Microsoft: Activity in other accounts and orgs](https://learn.microsoft.com/en-us/microsoftteams/activity-in-other-accounts-orgs)
