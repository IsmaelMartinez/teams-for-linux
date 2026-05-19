# Cross-Distro CI Smoke Test Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a GitHub Actions workflow that smoke-tests the app across 9 Linux configurations (3 distros x 3 display servers) on every push to main.

**Architecture:** A matrix-based GitHub Actions workflow builds Docker images from existing Dockerfiles and verifies the app starts and reaches the Microsoft login page in each configuration. A lightweight `smoke-check.sh` script polls the app log inside the container via `docker exec`. As a prerequisite, the test directory is restructured from `testing/` to `tests/`.

**Tech Stack:** GitHub Actions, Docker, Bash, existing cross-distro Dockerfiles and start scripts

**Spec:** Original design spec was archived after the workflow shipped; this plan and the live workflow at `.github/workflows/cross-distro-smoke.yml` are the authoritative references.

---

## Chunk 1: Directory restructuring and script fixes

### Task 1: Move cross-distro from testing/ to tests/

**Files:**
- Move: `testing/cross-distro/` → `tests/cross-distro/`
- Delete: `testing/spikes/` (all files)
- Delete: `testing/` directory (now empty)

- [ ] **Step 1: Move cross-distro directory**

```bash
git mv testing/cross-distro tests/cross-distro
```

- [ ] **Step 2: Delete stale spike files**

```bash
git rm -r testing/spikes
```

- [ ] **Step 3: Verify testing/ is now empty and remove it**

```bash
rmdir testing  # fails if not empty, which is what we want
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: move cross-distro tests to tests/ directory

Consolidates all test infrastructure under tests/ alongside unit/
and e2e tests. Removes stale spike files from testing/spikes/."
```

---

### Task 2: Add npm scripts to package.json

**Files:**
- Modify: `package.json:21-27` (scripts section)

- [ ] **Step 1: Add cross-distro scripts**

Add after the `test:authenticated` line in the scripts section:

```json
"cross-distro": "cd tests/cross-distro && ./run.sh",
"cross-distro:list": "cd tests/cross-distro && ./run.sh --list",
"cross-distro:smoke": "cd tests/cross-distro && ./scripts/smoke-check.sh",
```

- [ ] **Step 2: Verify scripts work**

```bash
npm run cross-distro:list
```

Expected: prints the 9 configurations table with ports.

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "feat: add npm scripts for cross-distro testing"
```

---

### Task 3: Update documentation references

**Files:**
- Modify: `docs-site/docs/development/plan/roadmap.md:73` — change `testing/cross-distro/` to `tests/cross-distro/`
- Modify: `docs-site/docs/development/adr/016-cross-distro-testing-environment.md:23` — change `testing/cross-distro/` to `tests/cross-distro/`
- Modify: `docs-site/docs/development/research/webauthn-fido2-implementation-plan.md:25,76-78,85,133` — change `testing/spikes/` references to note that files were removed (these are historical references in the spike validation steps)

- [ ] **Step 1: Update roadmap**

In `docs-site/docs/development/plan/roadmap.md`, replace `testing/cross-distro/` with `tests/cross-distro/`.

- [ ] **Step 2: Update ADR-016**

In `docs-site/docs/development/adr/016-cross-distro-testing-environment.md`, replace `testing/cross-distro/` with `tests/cross-distro/`.

- [ ] **Step 3: Update FIDO2 research doc**

In `docs-site/docs/development/research/webauthn-fido2-implementation-plan.md`, the references to `testing/spikes/spike-4-*` are historical (those files were created during the original spike). Add a note at the top of Chunk 1 Validation that the spike files were moved to `tests/spikes/` or removed. Do not change every occurrence — these are instructions for steps that have already been completed.

- [ ] **Step 4: Update cross-distro README**

In `tests/cross-distro/README.md`, verify all paths are relative (they should be since the README uses `./` paths). No changes expected.

- [ ] **Step 5: Commit**

```bash
git add docs-site/ tests/cross-distro/README.md
git commit -m "docs: update paths after test directory restructuring"
```

---

### Task 4: Fix Wayland/XWayland app log redirection

**Files:**
- Modify: `tests/cross-distro/scripts/start-wayland.sh:49-60`
- Modify: `tests/cross-distro/scripts/start-xwayland.sh:52-63`

The X11 script already redirects app output to `/tmp/app.log`. The Wayland and XWayland scripts launch the app via `swaymsg exec` with no log redirection. This needs to be consistent for the smoke check script to work.

- [ ] **Step 1: Fix start-wayland.sh**

Replace lines 51-53 in `tests/cross-distro/scripts/start-wayland.sh`:

```bash
# Before:
    if [[ "${AUTO_LAUNCH}" == "true" ]]; then
        echo "[Wayland] Auto-launching app with native Wayland..."
        swaymsg exec "$WAYLAND_APP_CMD" 2>/dev/null || $WAYLAND_APP_CMD &

# After:
    APP_LOG="/tmp/app.log"
    if [[ "${AUTO_LAUNCH}" == "true" ]]; then
        echo "[Wayland] Auto-launching app with native Wayland (logs: tail -f ${APP_LOG})..."
        bash -c "$WAYLAND_APP_CMD > $APP_LOG 2>&1" &
```

Note: we drop `swaymsg exec` for the auto-launch path and use `bash -c` with redirection instead. `swaymsg exec` detaches the process entirely, making log capture impossible. The app still runs as a Wayland client since the environment variables (`WAYLAND_DISPLAY`, `XDG_SESSION_TYPE`) are inherited.

- [ ] **Step 2: Fix start-xwayland.sh**

Replace lines 53-55 in `tests/cross-distro/scripts/start-xwayland.sh`:

```bash
# Before:
    if [[ "${AUTO_LAUNCH}" == "true" ]]; then
        echo "[XWayland] Auto-launching app (X11 client via XWayland)..."
        swaymsg exec "$APP_CMD" 2>/dev/null || $APP_CMD &

# After:
    APP_LOG="/tmp/app.log"
    if [[ "${AUTO_LAUNCH}" == "true" ]]; then
        echo "[XWayland] Auto-launching app (X11 client via XWayland, logs: tail -f ${APP_LOG})..."
        bash -c "$APP_CMD > $APP_LOG 2>&1" &
```

Same rationale as Wayland — `swaymsg exec` prevents log capture.

- [ ] **Step 3: Test locally (if Docker available)**

```bash
npm run cross-distro -- ubuntu wayland --latest
# In another terminal, after app starts:
# docker exec <container> cat /tmp/app.log | head -20
```

Verify `/tmp/app.log` exists and contains app output including URL navigation.

- [ ] **Step 4: Commit**

```bash
git add tests/cross-distro/scripts/start-wayland.sh tests/cross-distro/scripts/start-xwayland.sh
git commit -m "fix: redirect app output to /tmp/app.log on Wayland and XWayland

Consistent with X11 start script. Enables log-based smoke checks
and improves manual debugging (previously no app logs on Wayland)."
```

---

## Chunk 2: Smoke check script and CI workflow

### Task 5: Create smoke-check.sh script

**Files:**
- Create: `tests/cross-distro/scripts/smoke-check.sh`

- [ ] **Step 1: Write the smoke check script**

```bash
#!/bin/bash
# Smoke check for cross-distro testing containers.
# Polls /tmp/app.log inside a running container for the Microsoft login URL.
#
# Usage: smoke-check.sh <container-name> [timeout-seconds]
#
# Exit 0 if the app reaches login.microsoftonline.com within the timeout.
# Exit 1 if the container stops, the log file never appears, or time runs out.
set -e

CONTAINER="${1:?Usage: smoke-check.sh <container-name> [timeout-seconds]}"
TIMEOUT="${2:-120}"
MARKER="login.microsoftonline.com"
POLL_INTERVAL=5
LOG_FILE="/tmp/app.log"

echo "[smoke] Checking container: ${CONTAINER} (timeout: ${TIMEOUT}s)"

# Phase 1: Wait for the log file to exist (app download + startup)
ELAPSED=0
while [ "$ELAPSED" -lt "$TIMEOUT" ]; do
    # Check container is still running
    if ! docker inspect --format='{{.State.Running}}' "$CONTAINER" 2>/dev/null | grep -q true; then
        echo "[smoke] FAIL: Container ${CONTAINER} is not running"
        docker logs "$CONTAINER" 2>&1 | tail -30
        exit 1
    fi

    # Check if log file exists
    if docker exec "$CONTAINER" test -f "$LOG_FILE" 2>/dev/null; then
        echo "[smoke] Log file found after ${ELAPSED}s"
        break
    fi

    sleep "$POLL_INTERVAL"
    ELAPSED=$((ELAPSED + POLL_INTERVAL))
done

if [ "$ELAPSED" -ge "$TIMEOUT" ]; then
    echo "[smoke] FAIL: Log file ${LOG_FILE} not found after ${TIMEOUT}s"
    exit 1
fi

# Phase 2: Poll the log file for the login URL marker
while [ "$ELAPSED" -lt "$TIMEOUT" ]; do
    if ! docker inspect --format='{{.State.Running}}' "$CONTAINER" 2>/dev/null | grep -q true; then
        echo "[smoke] FAIL: Container ${CONTAINER} stopped unexpectedly"
        docker exec "$CONTAINER" cat "$LOG_FILE" 2>/dev/null | tail -30 || true
        exit 1
    fi

    if docker exec "$CONTAINER" grep -q "$MARKER" "$LOG_FILE" 2>/dev/null; then
        echo "[smoke] PASS: Found ${MARKER} in ${LOG_FILE} after ${ELAPSED}s"
        exit 0
    fi

    sleep "$POLL_INTERVAL"
    ELAPSED=$((ELAPSED + POLL_INTERVAL))
done

echo "[smoke] FAIL: ${MARKER} not found in ${LOG_FILE} after ${TIMEOUT}s"
echo "[smoke] Last 30 lines of app log:"
docker exec "$CONTAINER" tail -30 "$LOG_FILE" 2>/dev/null || echo "(could not read log)"
exit 1
```

- [ ] **Step 2: Make executable**

```bash
chmod +x tests/cross-distro/scripts/smoke-check.sh
```

- [ ] **Step 3: Commit**

```bash
git add tests/cross-distro/scripts/smoke-check.sh
git commit -m "feat: add smoke-check.sh for cross-distro CI validation

Polls /tmp/app.log inside a Docker container for the Microsoft
login URL. Two-phase approach: waits for log file to appear (app
download + startup), then polls for the marker string."
```

---

### Task 6: Create the GitHub Actions workflow

**Files:**
- Create: `.github/workflows/cross-distro-smoke.yml`

- [ ] **Step 1: Write the workflow file**

```yaml
name: Cross-Distro Smoke Test

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read

jobs:
  smoke:
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        distro: [ubuntu, fedora, debian]
        display: [x11, wayland, xwayland]
    name: smoke (${{ matrix.distro }}, ${{ matrix.display }})

    steps:
      - name: Check out repository
        uses: actions/checkout@08eba0b27e820071cde6df949e0beb9ba4906955 # v4.3.0

      - name: Resolve latest AppImage URL
        id: appimage
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          URL=$(gh release view --repo IsmaelMartinez/teams-for-linux --json assets \
            --jq '.assets[] | select(.name | endswith(".AppImage")) | .url' | head -1)
          if [ -z "$URL" ]; then
            echo "::error::Could not resolve AppImage URL from latest release"
            exit 1
          fi
          echo "url=${URL}" >> "$GITHUB_OUTPUT"
          echo "Resolved AppImage URL: ${URL}"

      - name: Build Docker image
        run: |
          docker build \
            -t cross-distro-${{ matrix.distro }} \
            -f tests/cross-distro/dockerfiles/${{ matrix.distro }}.Dockerfile \
            tests/cross-distro/

      - name: Start container
        run: |
          docker run -d \
            --name smoke-${{ matrix.distro }}-${{ matrix.display }} \
            --security-opt seccomp=unconfined \
            --cap-add SYS_PTRACE \
            --cap-add SYS_ADMIN \
            --cap-add SYS_NICE \
            --shm-size 4g \
            --platform linux/amd64 \
            -e DISPLAY_SERVER=${{ matrix.display }} \
            -e APP_URL="${{ steps.appimage.outputs.url }}" \
            -e AUTO_LAUNCH=true \
            -e SCREEN_RESOLUTION=1920x1080x24 \
            cross-distro-${{ matrix.distro }}

      - name: Run smoke check
        run: |
          tests/cross-distro/scripts/smoke-check.sh \
            smoke-${{ matrix.distro }}-${{ matrix.display }} 120

      - name: Write job summary
        if: always()
        run: |
          STATUS="${{ job.status }}"
          if [ "$STATUS" = "success" ]; then
            ICON="✅"
          else
            ICON="❌"
          fi
          echo "| ${{ matrix.distro }} | ${{ matrix.display }} | ${ICON} ${STATUS} |" >> "$GITHUB_STEP_SUMMARY"

      - name: Upload logs on failure
        if: failure()
        run: |
          mkdir -p /tmp/smoke-logs
          docker logs smoke-${{ matrix.distro }}-${{ matrix.display }} \
            > /tmp/smoke-logs/container.log 2>&1 || true
          docker exec smoke-${{ matrix.distro }}-${{ matrix.display }} \
            cat /tmp/app.log > /tmp/smoke-logs/app.log 2>/dev/null || true

      - name: Upload log artifacts
        if: failure()
        uses: actions/upload-artifact@bbbca2ddaa5d8feaa63e36b76fdaad77386f024f # v7.0.0
        with:
          name: smoke-logs-${{ matrix.distro }}-${{ matrix.display }}
          path: /tmp/smoke-logs/
          retention-days: 7

      - name: Cleanup container
        if: always()
        run: |
          docker rm -f smoke-${{ matrix.distro }}-${{ matrix.display }} 2>/dev/null || true
```

- [ ] **Step 2: Verify YAML syntax**

```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/cross-distro-smoke.yml'))"
```

Expected: no output (valid YAML).

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/cross-distro-smoke.yml
git commit -m "feat: add cross-distro smoke test CI workflow

Runs 9 configurations (3 distros x 3 display servers) in parallel
on push to main. Downloads latest release AppImage, builds Docker
images, and verifies the app starts and reaches the login page.

closes #2332"
```

---

### Task 7: Update roadmap

**Files:**
- Modify: `docs-site/docs/development/plan/roadmap.md`

- [ ] **Step 1: Update Phase 2 CI Integration section**

In the roadmap, update the Phase 2 section to note that the cross-distro smoke test CI workflow has been implemented. Mark the "CI smoke test for Dockerfiles" item as done. Keep the other Phase 2 items (gate builds on E2E, `.nvmrc`) as pending.

- [ ] **Step 2: Commit**

```bash
git add docs-site/docs/development/plan/roadmap.md
git commit -m "docs: update roadmap with cross-distro CI implementation"
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Move testing/ → tests/ | directory move + delete |
| 2 | Add npm scripts | `package.json` |
| 3 | Update doc references | roadmap, ADR-016, FIDO2 research |
| 4 | Fix Wayland/XWayland log redirection | `start-wayland.sh`, `start-xwayland.sh` |
| 5 | Create smoke-check.sh | new script |
| 6 | Create GitHub Actions workflow | `.github/workflows/cross-distro-smoke.yml` |
| 7 | Update roadmap | `roadmap.md` |

Tasks 1-3 are the prerequisite restructuring. Task 4 fixes a real gap in the existing scripts. Tasks 5-6 are the new CI functionality. Task 7 updates documentation.
