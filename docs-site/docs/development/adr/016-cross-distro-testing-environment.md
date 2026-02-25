---
id: 016-cross-distro-testing-environment
---

# ADR 016: Cross-Distro Testing Environment

## Status

Accepted

## Context

Teams for Linux runs across multiple Linux distributions (Ubuntu, Fedora, Debian) and display servers (X11, Wayland, XWayland). Users report issues specific to certain distro/display server combinations, but we had no systematic way to reproduce them. Manual testing required maintaining VMs or dual-boot setups, which was impractical for a volunteer-maintained project.

PR [#2226](https://github.com/IsmaelMartinez/teams-for-linux/pull/2226) introduced a Docker-based testing environment with 9 configurations (3 distros x 3 display servers), accessible via noVNC in a browser. This ADR documents the architecture decisions, the Apple Silicon limitation discovered during testing, and the recommended hosting approach.

## Decision

Use Docker containers with VNC/noVNC for cross-distro manual testing, hosted via GitHub Codespaces for maintainer access.

The environment supports three app delivery methods: `.deb`/`.rpm` packages (extracted at runtime via `dpkg-deb`/`rpm2cpio`), AppImage (with `--appimage-extract-and-run`), and source checkout (via `npm start`). Login session state is persisted via a mounted volume at `./session/`.

For hosting, use GitHub Codespaces as the primary environment. Codespaces provides native x86_64 Linux VMs with Docker-in-Docker support, port forwarding for noVNC access, and 120 free core-hours/month on the free plan. A `.devcontainer/devcontainer.json` is included in the `testing/cross-distro/` directory to support one-click setup.

## Consequences

### Positive

- Reproducible testing across 9 distro/display server combinations from a browser
- No VM management or dual-boot required
- Session persistence avoids re-authentication between container restarts
- GitHub Codespaces provides free x86_64 hosting with zero infrastructure management
- Existing CI infrastructure (GitHub Actions) can potentially reuse the Docker images

### Negative

- Cannot run the full app on Apple Silicon Macs (see below)
- Manual testing still required for MS login (automated testing blocked by MS authentication)
- Codespaces free tier limited to 120 core-hours/month (about 30 hours on 4-core)
- Teams web app is memory-hungry (~4-5 GiB under Docker)

### Apple Silicon Limitation

Testing on macOS with Apple Silicon (M1/M2/M3/M4) revealed a hard blocker: the Teams web app renderer process exceeds V8's 4GB pointer compression limit when running under Docker's Rosetta 2 x86_64 emulation. This is not specific to any display server (X11 and Wayland both crash identically) or app version (tested v2.7.7 and v2.7.8). The crash occurs consistently ~2-3 minutes after login when Teams' JavaScript heap reaches ~3975 MB.

V8's pointer compression is a compile-time feature in Electron that caps the heap at 4GB per process. Under Rosetta 2 emulation, the same web app uses roughly double the memory compared to native x86_64 execution, pushing it past this hard limit. There is no runtime workaround; disabling pointer compression requires building a custom Electron binary.

The Docker infrastructure itself (Xvfb, Sway, VNC, noVNC) works perfectly on Apple Silicon. The app starts, loads, and login succeeds. The crash only occurs after Teams fully hydrates its JavaScript post-login. Memory-reduction flags (`--disable-gpu-compositing`, `--renderer-process-limit=1`, `--disable-features=SpareRendererForSitePerProcess,BackForwardCache`) reduce idle memory from ~5 GiB to ~680 MiB pre-login, but the post-login spike still exceeds 4 GiB.

## Alternatives Considered

### Option 1: Local testing on Apple Silicon (current Mac hardware)

Run Docker containers locally with Rosetta 2 emulation.

- Pros: zero cost, immediate access, no network dependency
- Cons: V8 4GB heap limit causes consistent OOM crashes post-login
- **Why rejected**: fundamental V8 pointer compression limitation under Rosetta 2 makes it unusable for interactive testing

### Option 2: Hetzner or DigitalOcean x86_64 VPS

Rent a dedicated x86_64 VPS ($5-10/month for 8GB RAM) and run the Docker environment there.

- Pros: native x86_64 (no emulation overhead), persistent, always available, full control
- Cons: monthly cost, requires manual server management, SSH tunneling or firewall config for noVNC access
- **Worth considering if**: Codespaces free tier proves insufficient or session persistence across days is needed

### Option 3: GitHub Actions with tunnel

Use a manual `workflow_dispatch` workflow that starts the container and exposes noVNC via ngrok/cloudflared.

- Pros: free for public repos, native x86_64, no server management
- Cons: complex setup, 6-hour session timeout, tunnel adds latency, less interactive
- **Why rejected**: Codespaces provides a better experience for the same cost

### Option 4: Cloud testing platforms (Sauce Labs, BrowserStack)

Use commercial testing platforms for Electron app testing.

- Pros: managed infrastructure, CI integration
- Cons: Sauce Labs Electron support is Windows-only beta, no Linux support; BrowserStack doesn't support Electron desktop apps; expensive for the scale of this project
- **Why rejected**: no Linux Electron support on any platform

## Related

- PR [#2226](https://github.com/IsmaelMartinez/teams-for-linux/pull/2226): Cross-distro testing environment implementation
- ADR [009](009-automated-testing-strategy.md): Automated testing strategy (smoke tests with Playwright)
- [V8 Pointer Compression](https://v8.dev/blog/pointer-compression): technical background on the 4GB limit
- [Electron V8 Memory Cage](https://www.electronjs.org/blog/v8-memory-cage): Electron's adoption of pointer compression
- [Electron issue #33994](https://github.com/electron/electron/issues/33994): documentation of the 4GB cap
