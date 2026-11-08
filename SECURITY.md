# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| latest 2.x release | :white_check_mark: |
| earlier releases | :x:                |

Only the latest release receives security updates; fixes ship in the next regular release rather than as backports, so upgrade to the current version to benefit from them. The current release is listed on the [releases page](https://github.com/IsmaelMartinez/teams-for-linux/releases).

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
