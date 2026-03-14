---
id: 020-fido2-webauthn-support
---

# ADR 020: FIDO2 and WebAuthn Support on Linux

## Status

Implemented

## Context

Microsoft Teams uses WebAuthn for hardware security key (FIDO2) authentication. While Electron provides native WebAuthn support on macOS and Windows by interacting with the OS native APIs, it lacks support for WebAuthn on Linux because the Chromium implementation relies on specific system daemons or DBus services that are not universally available or configured in the same way across all Linux distributions.

As a result, Linux users of Teams for Linux could not use their hardware security keys (like YubiKeys) for authentication. We needed to find a reliable way to intercept WebAuthn requests and process them using a widely available Linux tool.

## Decision

We decided to:
1. **Monkey-patch `navigator.credentials`**: We inject a preload script (`webauthnOverride.js`) to intercept `navigator.credentials.create()` and `navigator.credentials.get()` calls within the Teams web app.
2. **Use IPC for Communication**: The intercepted calls serialize the WebAuthn options and send them to the main process via secure IPC channels (`webauthn:create`, `webauthn:get`).
3. **Shell out to `fido2-tools`**: In the main process (`fido2Backend.js`), we shell out to the `fido2-tools` CLI utilities (`fido2-token`, `fido2-cred`, `fido2-assert`). This package is widely available in most Linux distro repositories (e.g., Ubuntu, Fedora).
4. **Implement a Custom PIN Dialog**: Since `fido2-tools` may require a PIN for operations, we implemented a custom modal dialog (`pinDialog.js`) to collect the user's PIN securely and pass it to the `fido2-tools` stdin.
5. **Use `cbor-x` for Encoding**: To correctly parse and generate the CBOR-encoded `authenticatorData` and `attestationObject` required by the WebAuthn spec, we introduced the `cbor-x` dependency.

This approach was adapted from prior art in the `electron-webauthn-linux` project.

## Consequences

### Positive
- Linux users can now authenticate using hardware security keys seamlessly.
- We avoid maintaining a complex, low-level libfido2 node addon, relying instead on a robust CLI tool maintained by Yubico.
- The solution is completely isolated behind an opt-in configuration flag (`auth.webauthn.enabled`), ensuring no impact on users who do not need it or are on macOS/Windows.

### Negative
- Requires users to manually install the `fido2-tools` system package.
- Shelling out to a CLI tool is slower and less elegant than a native Node.js addon.
- The implementation requires maintaining a complex preload script that mocks the WebAuthn browser API perfectly.

### Neutral
- An additional third-party dependency (`cbor-x`) was added to the main process.
- Requires maintenance of the `fido2-tools` wrapper to handle various output formats and edge cases of different security keys.

## Alternatives Considered

### Option 1: Native Node.js Addon (e.g., `fido2` npm package)
- **Description**: Use a Node.js wrapper around `libfido2`.
- **Pros**: Better performance, more robust API without parsing CLI output.
- **Cons**: Compiling native addons for Electron across different platforms and Node versions is notoriously difficult and can cause build failures in CI or for end users. The available packages were either unmaintained or had complex build requirements.
- **Why rejected**: High maintenance burden for building native code, especially for a feature only needed on Linux.

### Option 2: Emulating a DBus service for Chromium
- **Description**: Run a background DBus service that Chromium's built-in WebAuthn support can talk to on Linux.
- **Pros**: No need to monkey-patch `navigator.credentials`.
- **Cons**: Extremely complex to implement and debug. Requires understanding Chromium's undocumented DBus expectations.
- **Why rejected**: Too high complexity and fragility.

## Related
- Issue #802
- PR implementing FIDO2 support
