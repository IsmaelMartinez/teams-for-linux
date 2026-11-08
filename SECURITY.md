# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| Latest release, including a pre-release | :white_check_mark: |
| Previous release, while the latest is still a pre-release | :white_check_mark: |
| Older releases | :x:                |

New releases ship as a pre-release first and are promoted to stable after a soak, so the two most recent releases are covered while that happens. Fixes land in the next regular release rather than as backports to older versions, so upgrade to benefit from them. Current versions are listed on the [releases page](https://github.com/IsmaelMartinez/teams-for-linux/releases).

## Reporting a Vulnerability

If you discover a security vulnerability in Teams for Linux, please report it responsibly:

1. **Do not** open a public GitHub issue for security vulnerabilities.
2. Instead, use [GitHub's private vulnerability reporting](https://github.com/IsmaelMartinez/teams-for-linux/security/advisories/new) to submit details confidentially.
3. Include a description of the vulnerability, steps to reproduce, and any potential impact.
4. You can expect an initial response within 7 days.
5. We will work with you to understand the issue and coordinate a fix and disclosure timeline.

## Privacy & Data Protection

For what personal data the application does and does not handle — and why the project processes none of its own — see the [Privacy & Data Protection statement](PRIVACY.md).

## Security Architecture

For details on the application's security controls (IPC validation, CSP headers, PII log sanitization, token encryption), see the [Security Architecture](docs-site/docs/development/security-architecture.md) documentation.
