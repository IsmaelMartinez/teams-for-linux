# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 2.7.x   | :white_check_mark: |
| < 2.7   | :x:                |

Only the latest release in the 2.7.x series receives security updates. Users should upgrade to the latest version to benefit from fixes.

## Reporting a Vulnerability

If you discover a security vulnerability in Teams for Linux, please report it responsibly:

1. **Do not** open a public GitHub issue for security vulnerabilities.
2. Instead, use [GitHub's private vulnerability reporting](https://github.com/IsmaelMartinez/teams-for-linux/security/advisories/new) to submit details confidentially.
3. Include a description of the vulnerability, steps to reproduce, and any potential impact.
4. You can expect an initial response within 7 days.
5. We will work with you to understand the issue and coordinate a fix and disclosure timeline.

## Security Architecture

For details on the application's security controls (IPC validation, CSP headers, PII log sanitization, token encryption), see the [Security Architecture](docs-site/docs/development/security-architecture.md) documentation.
