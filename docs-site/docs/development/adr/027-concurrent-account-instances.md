---
id: 027-concurrent-account-instances
---

# ADR 027: Concurrent Account Instances

## Status

✅ Accepted (2026-08-14)

## Context

Users who need two or three Microsoft 365 tenants **connected at the same time** (work and personal side by side, two windows, two trays) are not served by the ADR-020 in-window profile switcher. That switcher keeps extra sessions loaded but shows one Teams UI at a time.

The documented workaround — launch a separate process per account with `--user-data-dir`, `--class`, and `--appIcon` — already delivers simultaneous UIs. It is clunky (manual `.desktop` files, no in-app entry point) and easy to overuse (no cap).

ADR-010 rejected multiple `BrowserWindow`s **for a single account** (pop-out chats). Extra windows that are extra *accounts* are a different problem: they are already supported as extra processes, because Electron's single-instance lock is per user-data directory.

## Decision

Productize the separate-process workaround in-app, with a **hard cap of 3** accounts.

- New `Accounts` menu: **Open another account…**, **Manage accounts…**, and a radio list of configured accounts.
- Each extra account is a new Electron process with its own `user-data-dir` under `{homeUserData}-instances/{uuid}`, its own WM_CLASS, and its own tray.
- A registry file `concurrent-accounts.json` in the home instance's userData lists the family. Extra instances find it via `instance-family.json`.
- Config namespace `instances` (`enabled` default `true`, `autoLaunch` default `true`). Child processes set `TEAMS_FOR_LINUX_SKIP_INSTANCE_AUTO_LAUNCH=1` so they do not spawn each other.
- This is **not** the ADR-020 switcher. `multiAccount.enabled` remains a separate opt-in. Users can use one, the other, or the raw CLI.

### Rationale

1. Matches the requested UX: two or three Teams UIs live at once, not a switcher.
2. Reuses Electron's per-userData single-instance lock for focus-if-already-running.
3. Leaves ADR-010 intact (still no pop-out chats for one tenant).
4. Cap of 3 bounds memory (each instance is a full Teams web client) and hardware contention (one mic/camera/screen-share per process is still one meeting per window, which is honest).

## Consequences

### Positive

- In-app path for the workflow the docs already recommended
- Isolated sessions, trays, notifications, and calls
- No refactor of process-wide singletons (MQTT, incoming-call toast, tray)

### Negative

- N tray icons and N times the memory of a single instance
- Auto-launch can surprise users who only wanted one window (opt out with `instances.autoLaunch: false`)

### Neutral

- Manual `--user-data-dir` launches remain valid and are not counted toward the in-app cap
- Intune is per-process; concurrent instances plus Intune are untested and not blocked

## Alternatives Considered

### In-window switcher (ADR-020)

Rejected for this request: it is sequential use with warm sessions, not simultaneous UIs.

### Multiple BrowserWindows in one process

Rejected: collides with ADR-010's IPC/tray/call singletons. Separate processes already isolate those.

### Split pane in one window

Rejected: Teams' chrome is built for a full window.
