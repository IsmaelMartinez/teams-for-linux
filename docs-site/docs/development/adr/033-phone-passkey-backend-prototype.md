# ADR 033: Experimental phone passkey backend

## Status

Proposed.

## Context

[Issue #2714](https://github.com/IsmaelMartinez/teams-for-linux/issues/2714)
requests phone/QR passkey sign-in. The Linux bridge uses fido2-tools for USB
hardware keys, which does not provide caBLE phone transport.
[Issue #2767](https://github.com/IsmaelMartinez/teams-for-linux/issues/2767)
proposes an external-helper interface for password-manager bridging; this phone
backend uses that stdin/stdout interface.

[ADR 021](./021-webauthn-fido2-linux.md#external-helper-process-in-rust-or-go)
rejected a Rust/Go helper for v1 because distributing a compiled sidecar and
maintaining another toolchain added little over distro-shipped fido2-tools.
Phone transport needs capabilities that fido2-tools does not supply. This opt-in
backend therefore revisits that tradeoff: the separately maintained helper owns
native dependencies and releases, and users explicitly configure its executable.
Teams does not bundle or automatically install it; the build and distribution
burden remains with helper maintainers and users.

## Decision

Select the backend in `handleWebauthnRequest` using `auth.webauthn.backend`.
Hardware remains the default. Phone mode reuses the existing overrides,
login-frame relay, IPC handlers and `buildAllowedOrigins`.

Resolve the calling frame from the registered primary window's Electron frame
tree. Pass its origin, cross-origin top-origin metadata and assertion options to
the helper. The helper validates the relying-party ID against the origin and
public suffix list before using Bluetooth. Renderer overrides enforce the
frame's WebAuthn Permissions Policy.

Cancellation uses `webauthn:get` with a request ID bound to the calling frame.
Abort, document replacement, window destruction, renderer loss, timeout and QR
cancellation stop the helper. Same-document navigation preserves the request.
Phone timeouts retain fractional seconds in IPC and use milliseconds in the
helper request.

Keep native source, dependencies and public suffix data in a separate helper
repository. Teams contains the adapter, protocol runner and local QR dialog.
The dialog has an isolated, sandboxed renderer, external CSS with
`style-src 'self'`, and blocked navigation. Authentication data and helper
output are not logged.

## Consequences

Phone mode supports interactive assertions in the primary window and its login
frames. Registration and conditional/silent mediation use Chromium. Extension
inputs and outputs, multi-account profiles and detached windows are unsupported.
A missing helper returns `NotSupportedError`.

Helper distribution must provide pinned source, build/relink materials and an
update process for dependencies and public suffix data. Setup is documented in
the [configuration guide](../../configuration.md#experimental-phone-passkey-backend).

## Validation

Normal unit tests exercise the adapter and protocol runner. Electron tests cover
main/direct/nested frame assertions, Permissions Policy, credential prototypes,
short timeouts, cancellation and QR styling. Native protocol tests live with the
helper. Company acceptance and packaged-build results are recorded separately
from synthetic test results.
