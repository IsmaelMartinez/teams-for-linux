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

## Status (2026-02-27)

Steps 1-5 are complete, including Docker/Codespaces integration (Step 6).

### Implemented

All spikes validated. Playwright config, test helpers, and three test suites
are implemented. The cross-distro Docker environment supports a `--login` mode
(uses npm-installed Electron + noVNC so the user can authenticate interactively)
and a `--test` mode (runs Playwright against the persisted session). Both modes
use the same Electron binary, which is critical because different Chromium
versions have incompatible cookie databases.

A `run-all-tests.sh` script runs all 9 configurations sequentially and reports
a summary of pass/fail results.

### Test results (run on Codespaces with v2.7.8 AppImage session)

| Configuration      | Result | Notes                                    |
|--------------------|--------|------------------------------------------|
| ubuntu-x11         | 7/7    | Expected after networkidle fix           |
| ubuntu-wayland     | 6/6    | 1 skipped (desktopCapturer needs X11)    |
| ubuntu-xwayland    | 7/7    | All pass                                 |
| fedora-*           | 0/7    | Session not recognized (see Known Issues)|
| debian-*           | ---    | Disk space exhausted on Codespace        |

### Known Issues

1. Fedora's npm installs a different Node.js/Electron version, so the session
   created on Ubuntu is incompatible. Fix: run `--login` separately per distro,
   or pin the Electron version across all Dockerfiles.
2. Fedora's Sway gets "Operation not permitted" --- may need additional Docker
   security options (`--cap-add`, `--security-opt`).
3. Codespace disk fills up after ~6 containers due to npm ci per test run.
   Mitigate with `docker system prune` between runs or pre-caching node_modules.

### Key discoveries

The session MUST be created by the same Electron binary that runs the tests.
`--password-store=basic` is required so cookies are not tied to a specific D-Bus
session. `NODE_ENV=development` is needed to bypass the code-evaluation override
in browserWindowManager.js. Teams never reaches `networkidle` due to constant
WebSocket activity, so all tests use `domcontentloaded`. The `desktopCapturer`
test is skipped on pure Wayland because it needs an X11 display.

## Architecture

```text
Phase 1: Manual Login (one-time per session expiry, per distro)
+--------------------------------------+
|  ./run.sh ubuntu x11 --login        |
|                                      |
|  Docker container starts             |
|  > npm ci + Electron install         |
|  > noVNC available in browser        |
|  > User logs into Teams via noVNC    |
|  > Ctrl+C saves session to ./session |
+--------------------------------------+

Phase 2: Automated Tests (repeatable, all configs)
+--------------------------------------+
|  ./run-all-tests.sh                  |
|                                      |
|  For each distro x display server:   |
|  > ./run.sh <distro> <ds> --test     |
|  > Mounts saved session read-only    |
|  > Runs Playwright tests             |
|  > Reports pass/fail per config      |
|  > Summary at end                    |
+--------------------------------------+
```

## Test Suite

### app-ready.spec.js (2 tests)

1. App loads Teams without redirecting to login --- validates session persistence
2. Teams UI loads to a usable state --- verifies no crash indicators

### screen-sharing.spec.js (2 tests)

1. desktopCapturer returns screen and window sources --- skipped on pure Wayland
2. App starts without screen sharing errors --- checks console for SCREEN_SHARE errors

### window-management.spec.js (2 tests)

1. Main window has a reasonable size --- validates viewport dimensions
2. App is responsive and has no crash indicators --- verifies Teams URL and no crash text

### Total: 6-7 tests per configuration (1 skipped on pure Wayland)

## Electron Upgrade Testing Workflow

When upgrading Electron (e.g., 39 to 40):

1. Check out the Electron upgrade branch
2. `cd testing/cross-distro`
3. `./run.sh ubuntu x11 --login` --- log in via noVNC, then Ctrl+C
4. `./run-all-tests.sh` --- runs all 9 configurations
5. If tests pass: confidence the upgrade does not break core functionality
6. `./run-all-tests.sh --cleanup` to remove the session folder

## Open Questions

1. Per-distro sessions: Fedora tests fail because the session was created
   with Ubuntu's Electron version. Should the workflow require a separate
   `--login` per distro, or can we pin the Electron version?
2. Session expiry handling: How long do Microsoft tokens last? Should the
   test runner detect expired sessions and prompt for re-login?
3. CI integration: Worth storing encrypted session tokens in GitHub Secrets
   for automated CI runs, or keep this as a manual developer workflow?
