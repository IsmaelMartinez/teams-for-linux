# Cross-Distro CI Smoke Test

**Date:** 2026-03-14
**Status:** Design approved, ready for implementation
**Related:** [ADR-016](../adr/016-cross-distro-testing-environment.md), [Roadmap — Phase 2](../plan/roadmap.md)

## Problem

The `testing/cross-distro/` Docker-based testing environment works well for manual validation but has no CI integration. The app is only tested on `ubuntu-latest` in CI (via `build.yml`). Dockerfile regressions, distro-specific library changes, and display server incompatibilities go undetected until someone manually runs `./run.sh`.

## Solution

A new GitHub Actions workflow (`cross-distro-smoke.yml`) that runs on every push to `main`. It builds the three Docker images (Ubuntu 24.04, Fedora 41, Debian Bookworm) and verifies the app starts successfully across all 9 distro/display-server configurations (3 distros x 3 display servers: x11, wayland, xwayland).

## Design

### Trigger

Push to `main` only. This workflow does not run on PRs to avoid consuming Actions minutes on every PR update. The existing `build.yml` E2E tests cover PR validation. This workflow validates that the app works across real Linux environments after code lands.

A `workflow_dispatch` trigger is also included so the workflow can be run manually for debugging or after Dockerfile changes.

### Matrix strategy

The workflow uses a GitHub Actions matrix over `distro: [ubuntu, fedora, debian]` and `display: [x11, wayland, xwayland]`, producing 9 parallel jobs. Each configuration runs as a separate job, so failures are isolated and visible in the Actions UI without expanding logs.

Since each matrix job runs on its own GitHub Actions runner VM, there are no container name collisions between parallel jobs. Each job uses a deterministic container name (`smoke-{distro}-{display}`) for clarity in logs.

### Job steps (per matrix entry)

1. Check out the repository.
2. Resolve the latest release AppImage URL via the GitHub API (`gh release view --json assets`). This replaces the `--latest` flag from `run.sh`, which is a host-side convenience and not available inside `docker run`.
3. Build the Docker image for the matrix distro using the existing Dockerfile (`testing/cross-distro/dockerfiles/{distro}.Dockerfile`). Tag it as `cross-distro-{distro}`.
4. Start the container in detached mode with `DISPLAY_SERVER` set to the matrix display value and `APP_URL` set to the resolved AppImage URL. Mount no volumes (no session, no source — this is a cold-start smoke test).
5. Run a smoke check: use `docker exec` to poll the app's log file (`/tmp/app.log`) inside the container for up to 120 seconds, looking for `login.microsoftonline.com` in the output (the same assertion as the existing `smoke.spec.js` — the app launched, loaded Teams, and redirected to login).
6. If the marker is found, pass. If the container exits or the timeout expires, fail.
7. Stop and remove the container.
8. On failure, upload the full container logs as an artifact for debugging.

### Smoke check script

A new script `testing/cross-distro/scripts/smoke-check.sh` encapsulates the health check logic. It accepts a container name and a timeout, uses `docker exec` to read `/tmp/app.log` inside the container, and exits 0 on success or 1 on failure. This script can also be used locally outside of CI.

```
Usage: smoke-check.sh <container-name> [timeout-seconds]
```

The check uses `docker exec` rather than `docker logs` because the app's stdout/stderr is redirected to `/tmp/app.log` inside the container by the display server start scripts (e.g. `start-x11.sh` line 43: `$APP_CMD > "$APP_LOG" 2>&1 &`). On Wayland/XWayland, the app is launched via `swaymsg exec`, which further detaches it from the container's PID 1. The app output never reaches `docker logs`.

### Report

Each matrix job appears as a separate check in the GitHub Actions UI (e.g. "ubuntu / x11", "fedora / wayland"). Pass/fail is immediately visible without expanding any logs.

A final `report` job runs after all matrix jobs complete (using `if: always()` and `needs: [smoke-test]`). It reads the `needs` context to determine which jobs passed or failed and writes a markdown summary table to `$GITHUB_STEP_SUMMARY` showing all 9 configurations and their status in one view.

### Docker configuration for CI

The containers need specific Docker flags to run Electron and Sway inside GitHub Actions runners:

- `--security-opt seccomp=unconfined` — required for Sway/wlroots
- `--cap-add SYS_PTRACE SYS_ADMIN SYS_NICE` — required for Electron sandbox and Sway process management
- `--shm-size 4g` — matches `docker-compose.yml`; Electron and Sway both need substantial shared memory
- `--platform linux/amd64` — explicit platform (Actions runners are already amd64)

These match the existing `docker-compose.yml` configuration.

### What this tests

The smoke test validates the full cold-start path: Docker image builds correctly, all distro-specific dependencies are present, the display server starts (Xvfb for X11, Sway for Wayland/XWayland), Electron launches without crashing, and the app reaches the Microsoft login page.

### What this does not test

This tests the latest released AppImage, not the code at HEAD. A just-merged change that breaks a specific distro won't be caught until the next release. Testing HEAD code would require building the AppImage from source in CI (adds ~5 minutes). This can be added later as an enhancement, either as a separate workflow or a `workflow_dispatch` input that triggers a from-source build.

Authenticated features (post-login behaviour, screen sharing, notifications) are not tested. Those require the `--login` / `--test` workflow which needs a real Microsoft account session.

### Known risks

**Microsoft login page reachability.** The smoke check asserts that the app reaches `login.microsoftonline.com`. If Microsoft blocks or rate-limits requests from GitHub Actions runner IPs, the test will timeout and produce false failures. This is a known flakiness risk with CI-to-Microsoft-service interactions. Mitigation: the 120-second timeout is generous, and failures on main are informational (they don't gate releases). If this becomes a recurring problem, the assertion could be relaxed to check for any successful navigation rather than specifically the login URL.

**Docker image build time.** Each of the 9 matrix jobs builds its Docker image from scratch on a fresh runner (3–5 minutes per build). No layer caching is included in the initial implementation to keep complexity low. If build times become a bottleneck, add `actions/cache` with `docker save`/`docker load` or GitHub's built-in Docker layer cache as a follow-up.

**AppImage download time.** The AppImage (~120MB) is downloaded inside each container. Combined with the image build, Sway startup, and Electron initialization, the 120-second smoke check timeout starts after the container is already running and the app has been downloaded. The download happens during container startup (handled by `entrypoint.sh`), so the smoke check script should wait for `/tmp/app.log` to exist before starting the timeout countdown.

### Future enhancements

- `workflow_dispatch` input to build from source instead of using `--latest`
- Docker layer caching to reduce build times
- Scheduled weekly run to catch distro package updates that break the images
- Notification to a GitHub issue or Slack if the smoke test fails on main
