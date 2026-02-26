# Plan: Automated Post-Auth Playwright Testing for Electron Upgrades

## Problem

Electron upgrades are the main pain point for Teams for Linux. They can break
screen sharing, display server compatibility, and other complex features. Today,
validating these requires fully manual testing. The existing Playwright smoke
tests only cover the pre-auth flow (app launch → MS login redirect) because
Microsoft's authentication wall blocks automated testing of post-auth features.

## Core Idea

Login once manually, then run automated Playwright tests against the
authenticated app using the persisted session.

The app already supports `E2E_USER_DATA_DIR` to override its userData path
(`app/index.js:58`). If we point that at a directory where a real login session
has been saved, Playwright can relaunch the app and it should come back
authenticated — no manual login needed for subsequent test runs.

## Strategy: macOS-First, Docker Later

### Why macOS first

The cross-distro Docker environment runs `linux/amd64` containers. On Apple
Silicon Macs, V8's 4GB pointer compression limit under Rosetta 2 causes the
app to OOM-crash ~2-3 minutes after login (documented in ADR-016). This makes
Docker unusable for interactive testing on the development machine.

Running Playwright natively on macOS avoids this entirely: no Docker, no
Rosetta, no memory limits. The tests validate whether Electron upgrades break
core functionality — which is the primary goal.

### When to add Docker/Linux testing

Once the macOS test suite works, it can be reused in:

- **GitHub Codespaces** — native x86_64, the devcontainer already forwards
  noVNC ports 6081-6089, 120 free core-hours/month
- **GitHub Actions** — for CI with a stored session (requires encrypted
  secrets)
- **Linux VPS** — if Codespaces proves insufficient (~$5-10/month on
  Hetzner/DigitalOcean)

The Playwright tests themselves are portable. Only the launch config (electron
flags, session path) differs between macOS and Docker.

## Architecture

```text
Phase 1: Manual Login (one-time per session expiry)
┌──────────────────────────────────────┐
│  macOS (native)                      │
│                                      │
│  npm start                           │
│  → App launches, you log in          │
│  → Session saved to ./test-session/  │
└──────────────────────────────────────┘

Phase 2: Automated Tests (repeatable)
┌──────────────────────────────────────┐
│  macOS (native)                      │
│                                      │
│  npx playwright test                 │
│  → Launches app with saved session   │
│  → App loads already authenticated   │
│  → Tests run against Teams UI        │
│  → Reports pass/fail                 │
└──────────────────────────────────────┘
```

## Required Spikes (Before Implementation)

Three spikes to validate the approach. All runnable on macOS right now.

### Spike 1: Session reuse after app restart

The entire approach depends on this. Steps:

1. Launch the app with a custom userData dir:
   `E2E_USER_DATA_DIR=./test-session npm start`
2. Log in to Teams manually
3. Close the app (Cmd+Q)
4. Relaunch with same dir:
   `E2E_USER_DATA_DIR=./test-session npm start`
5. Does it come back authenticated or hit the login wall?

Script: `testing/spikes/spike-1-session-reuse.sh`

**If this fails:** pivot to CDP approach (Playwright connects to an
already-running, already-authenticated app via Chrome DevTools Protocol).

### Spike 2: desktopCapturer returns sources on macOS

Verify that `desktopCapturer.getSources()` works and returns screen/window
sources. This is the API that screen sharing depends on.

Script: `testing/spikes/spike-2-desktop-capturer.js`

Run with: `npx electron testing/spikes/spike-2-desktop-capturer.js`

macOS may prompt for Screen Recording permission — that's expected and
actually tests the permission flow too.

### Spike 3: Playwright can launch and interact with authenticated app

Use Playwright's Electron API to launch the app with the saved session from
Spike 1, wait for it to load, and verify it's authenticated (not on the
login page).

Script: `testing/spikes/spike-3-playwright-launch.js`

Run with: `node testing/spikes/spike-3-playwright-launch.js`

## Implementation Steps (Post-Spikes)

### Step 1: Playwright config and test helpers for authenticated tests

A new Playwright config separate from the smoke tests:

- `playwright.authenticated.config.js` — points to `tests/e2e/authenticated/`,
  uses `E2E_USER_DATA_DIR` for session, longer timeouts
- `tests/e2e/authenticated/helpers.js` — shared launch helper

### Step 2: Authenticated app launch test

`tests/e2e/authenticated/app-ready.spec.js` — the baseline test:

- Launch app with saved session
- Verify it does NOT redirect to login
- Verify Teams main UI renders (chat list, calendar, etc.)
- This test must pass before any other authenticated test

### Step 3: Screen sharing test

`tests/e2e/authenticated/screen-sharing.spec.js`:

- Verify `desktopCapturer.getSources()` returns sources via
  `electronApp.evaluate()`
- If possible, trigger screen share flow and verify no crash

### Step 4: Additional regression tests

- `window-management.spec.js` — resize, minimize/restore, tray behavior
- `notification.spec.js` — notification permission and display
- More as needed based on what Electron upgrades tend to break

### Step 5: npm script and documentation

- Add `npm run test:authenticated` script
- Document the login-once-then-test workflow in the testing README

### Step 6 (Later): Docker/Codespaces integration

Adapt the test suite for the cross-distro Docker environment:

- Docker-specific electron flags (`--no-sandbox`, `--disable-gpu`, etc.)
- `--test` flag on `run.sh`
- Tests run inside the container against Linux display servers

## Electron Upgrade Testing Workflow

When upgrading Electron (e.g., 39 → 40):

1. Check out the Electron upgrade branch
2. `npm ci`
3. If no saved session: `E2E_USER_DATA_DIR=./test-session npm start`, log in,
   close
4. `npm run test:authenticated`
5. If tests pass: confidence the upgrade doesn't break core functionality
6. For Linux-specific validation: use Codespaces with the Docker environment

## Open Questions

1. **Screen sharing scope**: Test `desktopCapturer` API in isolation, or try
   to trigger the full Teams screen sharing flow? The latter requires being in
   a call.
2. **Session expiry handling**: How long do Microsoft tokens last? Should the
   test runner detect expired sessions and prompt for re-login?
3. **CI integration**: Worth storing encrypted session tokens in GitHub Secrets
   for automated CI runs, or keep this as a manual developer workflow?
