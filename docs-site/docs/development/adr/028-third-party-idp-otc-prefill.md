---
id: 028-third-party-idp-otc-prefill
---

# ADR 028: One-Time-Code Pre-fill on Third-Party Identity Providers

## Status

❌ Rejected

## Context

[#2869](https://github.com/IsmaelMartinez/teams-for-linux/issues/2869) asked for a `totpCommand`
companion to the shipped `auth.webLogin.passwordCommand`, so an authenticator code could be pulled
from a password manager the same way a password already is.

**Investigation Date:** August 2026
**Attempted in:** [PR #2874](https://github.com/IsmaelMartinez/teams-for-linux/pull/2874)

The password half works because `input[type=password]` is effectively universal. One-time-code
fields are not. The attempt matched Entra's converged code page (`input[name="otc"]`,
`#idTxtBx_SAOTCC_OTC`) and then, on report, Okta Identity Engine's
`input[name="credentials.totp"]`, plus an `auth.webLogin.totpSelector` escape hatch for anything
else.

The reporter's org runs Okta across three separate screens: identify, "Verify with your password",
then "Enter code from Okta Verify app". Even with their exact field in the built-in list, the code
step was never filled.

## Decision

Do not pursue one-time-code pre-fill against third-party identity providers. `auth.webLogin.user`
and `auth.webLogin.passwordCommand` remain supported for the Microsoft-hosted sign-in pages they
were built for.

## Options considered

### Selector matching per tenant, rejected

Okta ships `autocomplete="off"` on the code field deliberately.
[okta-signin-widget#1119](https://github.com/okta/okta-signin-widget/issues/1119), asking for
autocomplete and password-manager support, has been open for years with no resolution from Okta,
so this is a position rather than an oversight, and a defensible one for a second factor.

The element ids are generated per render (the reported one was `input54`), leaving only `name`,
which is an internal widget field key carrying no compatibility contract. Every tenant can also
customise the widget. Chasing that markup is a treadmill we would lose, and each miss looks like a
regression to the user.

### Loading a password-manager browser extension, rejected

The obvious escape from selectors is to let a real password manager do the filling. Electron
cannot host one.

Per [Electron's extension documentation](https://www.electronjs.org/docs/latest/api/extensions),
the supported `chrome.*` surface does not include `chrome.runtime.connectNative`. Native messaging
is exactly how 1Password, KeePassXC and Bitwarden's desktop integration reach a local vault, so the
extensions cannot talk to the app that holds the secrets. Electron additionally loads only unpacked
extensions (no `.crx`), supports only `chrome.storage.local`, and has no concept of popups or
extension actions, so there would be no toolbar UI either.

This is the same wall behind
[#2609](https://github.com/IsmaelMartinez/teams-for-linux/issues/2609) and its spike in
[#2610](https://github.com/IsmaelMartinez/teams-for-linux/pull/2610). Allowlisting our binary in
`/etc/1password/custom_allowed_browsers` governs which browsers the 1Password app will speak to
over that same extension-to-app channel; without an extension able to use native messaging, the
allowlist alone is unlikely to achieve anything. That matches the fact that nobody has confirmed
the autofill shortcut filling an Electron window since the question was asked on #2609.

### Driving the identity provider's API directly, rejected

Okta's modern [Interaction Code grant](https://developer.okta.com/docs/concepts/interaction-code/)
is designed for applications that own the Okta relationship and requires an app registration inside
each customer's org. Teams for Linux wraps Microsoft Teams and never owns that relationship. The
classic `/api/v1/authn` sessionToken route is superseded and being retired.

## Consequences

Users wanting fewer credential prompts are better served by an authentication method with an actual
contract behind it, all of which the app already supports:

- **FIDO2 / WebAuthn** (`auth.webauthn.enabled`, [ADR-021](021-webauthn-fido2-linux.md)), a W3C API
  rather than scraped markup.
- **Client certificates and smartcards** via PKCS#11 (`auth.clientCertificate.pinDialog.enabled`,
  [ADR-024](024-smartcard-pkcs11-pin-dialog.md)).
- **Intune SSO** (`auth.intune.enabled`).

The most effective change is usually not in this app at all. Okta Verify push, "remember this
device", and FastPass all remove code entry entirely, and are org policy.

Reimplementing a selector-based pre-fill is not difficult if a future contributor wants it for a
stable in-house IdP. This record exists so that work starts from the known dead ends rather than
rediscovering them.
