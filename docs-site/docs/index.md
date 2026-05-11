---
id: index
title: Teams for Linux Documentation
slug: /
---

# Teams for Linux

A native Linux desktop wrapper around the Microsoft Teams web app, with the integration features the web client cannot provide on its own: system tray and notifications, custom backgrounds, screen sharing, multiple account profiles, certificate handling, Intune SSO, secure token storage, and an MQTT bridge for home automation.

:::info
Independent project, not affiliated with Microsoft. Some behaviour is constrained by what the Teams web app exposes.
:::

## Quick start

Install the package for your distribution from the [Installation guide](installation.md), then launch:

```bash
teams-for-linux
```

For a custom configuration, drop a JSON file at `~/.config/teams-for-linux/config.json`. The full schema lives in the [Configuration reference](configuration.md). A minimal example:

```json
{
  "closeAppOnCross": false,
  "followSystemTheme": true,
  "trayIconEnabled": true
}
```

If the app misbehaves, the [Troubleshooting guide](troubleshooting.md) covers the common cases (Wayland rendering, screen sharing, notifications, certificates).

## Guides

User-facing topics:

- [Installation](installation.md) — package repositories and manual install for every supported distribution
- [Configuration](configuration.md) — every option, with defaults
- [Multiple instances](multiple-instances.md) — running separate work and personal profiles side by side
- [Screen sharing](screen-sharing.md) — Wayland and X11 setup, including portal selection
- [Custom backgrounds](custom-backgrounds.md) — adding your own video-call backgrounds
- [Certificate management](certificate.md) — corporate CA bundles and proxy interception
- [Intune SSO](intune-sso.md) — Microsoft Identity Broker integration
- [MQTT integration](mqtt-integration.md) — publish presence and call status to a broker
- [Troubleshooting](troubleshooting.md) — diagnostics for common Linux desktop issues

## Contributing

If you want to fix a bug or add a feature:

- [Contributing guide](development/contributing.md) — local setup, code standards, PR workflow
- [Architecture overview](development/contributing.md#architecture-overview) — how the main and renderer processes are wired
- [Architecture Decision Records](development/adr/README.md) — the rationale behind significant choices
- [Release process](development/manual-release-process.md) — how versions are cut via release-please

## Community

- [GitHub Issues](https://github.com/IsmaelMartinez/teams-for-linux/issues) — bug reports and feature requests
- [Matrix space](https://matrix.to/#/#teams-for-linux-space:matrix.org) — chat with users and contributors
