# Plan: Docker Playwright Testing with Persisted Session

## Problem

Electron upgrades are the main pain point for Teams for Linux. They can break
screen sharing, display server compatibility, and other complex features. Today,
validating these requires fully manual testing via noVNC. The existing Playwright
smoke tests only cover pre-auth flow (app launch → MS login redirect) because
Microsoft's authentication wall blocks automated testing of post-auth features.

## Core Idea

**Login once manually, then run automated Playwright tests against the
authenticated app using the persisted session.**

The cross-distro Docker environment already persists the login session in
`./session/`. After a one-time manual login via noVNC, Playwright can relaunch
the app with that saved session and run tests against the fully authenticated
Teams interface.

## Architecture

```text
Phase 1: Manual Login (one-time)
┌──────────────────────────────────────────┐
│  Docker Container                        │
│  ┌────────┐  ┌────────────────────────┐  │
│  │ Xvfb / │  │  Teams for Linux       │  │
│  │ Sway   │  │  (Electron)            │  │
│  └────────┘  └────────────────────────┘  │
│  ┌────────┐                              │
│  │ noVNC  │ ← You log in here            │
│  └────────┘                              │
│  ./session/ ← session cookies saved      │
└──────────────────────────────────────────┘

Phase 2: Automated Tests (repeatable)
┌──────────────────────────────────────────┐
│  Docker Container                        │
│  ┌────────┐  ┌────────────────────────┐  │
│  │ Xvfb / │  │  Teams for Linux       │  │
│  │ Sway   │  │  (launched by          │  │
│  └────────┘  │   Playwright)          │  │
│              └────────────────────────┘  │
│  ┌────────────────────────────────────┐  │
│  │  Playwright Test Runner            │  │
│  │  - Uses saved session from Phase 1 │  │
│  │  - Runs screen sharing tests       │  │
│  │  - Reports pass/fail               │  │
│  └────────────────────────────────────┘  │
│  ./session/ ← reused from Phase 1       │
└──────────────────────────────────────────┘
```

## Critical Review: Untested Assumptions

Before writing real test code, three assumptions must be validated.

### Assumption 1: Session reuse after app restart actually works

The entire plan hinges on "Playwright relaunches the app with the saved
`./session/` dir and it comes back authenticated." But Microsoft tokens might:

- Be tied to the specific Electron process/session
- Expire quickly (especially refresh tokens under certain tenant policies)
- Require re-auth after app restart (Teams sometimes does this)

**This is the single biggest risk.** If session reuse doesn't work reliably,
the whole approach needs rethinking (e.g., CDP connection to running app
instead).

### Assumption 2: desktopCapturer works in Docker with Xvfb/Sway

The plan assumes Xvfb provides a virtual display that
`desktopCapturer.getSources()` can see. But modern Electron/Chromium
increasingly uses **PipeWire + XDG Desktop Portal** for screen capture on
Linux. Inside Docker, there's likely no PipeWire daemon or portal running.
This could mean desktopCapturer returns zero sources, making screen sharing
tests impossible without additional plumbing (installing PipeWire, etc.).

### Assumption 3: What "screen sharing test" even means

In Teams, you can only share your screen **during a call**. You can't just
open a screen sharing picker from the main interface. So what exactly are we
testing? Options:

- Testing the Electron-side `desktopCapturer` API in isolation (not through
  Teams UI)
- Testing that the app doesn't crash when screen sharing is invoked
- A test meeting to join (requires a second account or a test meeting link)

### CDP vs Session-Reuse: Still an open question

The session-reuse approach (Playwright launches a fresh Electron process with
saved session) gives full Playwright Electron API access. But CDP connection
to a running app avoids the session reuse question entirely — you log in, then
Playwright connects to the already-running app. The tradeoff is losing
`electronApp.evaluate()`. Worth deciding after Spike 1 results.

## Required Spikes (Before Implementation)

### Spike 1: Session reuse (~10 min)

1. Start container: `./run.sh ubuntu x11`
2. Login via noVNC
3. Kill the app from xterm (not the container)
4. Relaunch the app from xterm
5. Does it come back authenticated or hit the login wall?
6. Stop and restart the container entirely — still authenticated?

**If this fails:** pivot to CDP approach (connect to running app).

### Spike 2: desktopCapturer in Docker (~15 min)

Write a tiny Electron script:

```javascript
const { app, desktopCapturer } = require('electron');
app.whenReady().then(async () => {
  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window']
  });
  console.log('Sources found:', sources.length);
  sources.forEach(s => console.log(` - ${s.name} (${s.id})`));
  app.quit();
});
```

Run it inside the container on X11 and Wayland. If it returns zero sources,
investigate PipeWire/xdg-desktop-portal.

### Spike 3: Playwright launching Electron in container (~10 min)

1. Install Node.js in the container: `apt install nodejs npm`
2. Mount the project source
3. Run the existing smoke test inside the container:
   `npx playwright test`
4. Does Playwright + Electron work in this Docker environment?

## Implementation Steps (Post-Spikes)

### Step 1: Install Node.js + Playwright in Docker images

Add `nodejs` and `npm` to the three Dockerfiles. Playwright and test scripts
are mounted from the host via a new volume.

**Changes:**

- `dockerfiles/ubuntu.Dockerfile` — add `nodejs npm` packages
- `dockerfiles/fedora.Dockerfile` — add `nodejs npm` packages
- `dockerfiles/debian.Dockerfile` — add `nodejs npm` packages
- `docker-compose.yml` — add volume mount: `../../:/src:ro`

### Step 2: Create Docker-specific Playwright config and test helpers

**New files:**

- `testing/cross-distro/playwright.docker.config.js` — Docker-specific
  config (persisted session dir, Docker electron flags, longer timeouts)
- `tests/e2e/docker/test-utils.js` — shared helpers (launch app with
  session, Docker electron flags, wait-for-teams-ready)

### Step 3: Write the screen sharing test

**New file:** `tests/e2e/docker/screen-sharing.spec.js`

What we can validate in Docker:

- `desktopCapturer` API returns sources (virtual display)
- Screen sharing UI elements render (if in a call)
- No crashes or console errors during the flow

What we cannot validate:

- Actual meeting screen sharing (requires two participants)
- Network quality of the shared stream

### Step 4: Add a `--test` flag to `run.sh`

```bash
# Phase 1: Login manually (one-time)
./run.sh ubuntu x11

# Phase 2: Run tests (repeatable)
./run.sh ubuntu x11 --test

# Run specific test
./run.sh ubuntu x11 --test screen-sharing

# Run across configs
./run.sh ubuntu wayland --test
./run.sh fedora x11 --test
```

### Step 5: Create test mode entrypoint

**New file:** `testing/cross-distro/scripts/run-tests.sh`

1. Starts display server (Xvfb/Sway) but not the app
2. Checks `./session/` has valid session data
3. Runs `npx playwright test` with the Docker config
4. Exits with the test exit code

### Step 6: Additional test scenarios

- `app-launch-authenticated.spec.js` — app starts authenticated, main UI
  renders
- `window-management.spec.js` — resize, minimize/restore, second window
- `display-server.spec.js` — ozone platform detection on Wayland vs X11

### Step 7: Documentation

Update `testing/cross-distro/README.md` with the login-once-then-test
workflow, how to write new tests, and session expiry troubleshooting.

## Electron Upgrade Testing Workflow

The primary use case. When upgrading Electron (e.g., 39 → 40):

1. Build with new Electron: `npm run dist:linux`
2. Copy to `testing/cross-distro/app/`
3. Login: `./run.sh ubuntu x11`
4. Run tests: `./run.sh ubuntu x11 --test`
5. Test other configs: `./run.sh ubuntu wayland --test`, etc.
6. Fix failures, rebuild, repeat

Turns an entirely manual process (9 configs × N features) into:
manual login + automated regression checks.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Teams DOM changes break selectors | Tests fail on unrelated changes | Focus on Electron APIs, not Teams DOM |
| Session tokens expire | Tests fail with auth errors | Pre-flight session check; re-login is quick |
| Tests are flaky in Docker | False failures | Conservative timeouts, retry logic |
| Playwright version conflicts | Install issues | Pin version, `npx playwright install --with-deps` |

## Open Questions

1. **Screen sharing scope**: Test desktopCapturer API in isolation, or attempt
   joining a test meeting?
2. **CI integration**: Manual trigger only, or also GitHub Actions? (CI needs
   encrypted session tokens as secrets.)
3. **Source vs built app**: Test against `npm start` or built AppImage?
   AppImage is closer to real usage but slower to iterate.

## This Work Should Be Done Locally

This is exploratory and Docker-heavy. The spikes require:

- Starting containers and interacting via noVNC
- Manual Microsoft login
- Observing real behavior (does desktopCapturer work? does session persist?)

Best done as a collaborative local session: you drive the terminal, we iterate
on scripts and tests together based on spike results.
