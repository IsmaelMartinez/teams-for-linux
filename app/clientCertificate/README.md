# Client Certificate (Smartcard / NSS PIN)

On Linux, Chromium asks the embedding application for a PKCS#11 token password (PIN) when a client certificate stored on a smartcard needs unlocking. This module registers `app.setClientCertRequestPasswordHandler` (Electron 33+) and shows that PIN dialog. Without it, smartcard-backed client-certificate authentication fails silently: NSS never receives the PIN and the certificate is never presented. See issue #2639.

The feature is Linux only and off by default. It has no effect on macOS or Windows, which ship native PIN prompts. Enable it with the `auth.clientCertificate.pinDialog.enabled` flag (a restart is required):

```json
{ "auth": { "clientCertificate": { "pinDialog": { "enabled": true } } } }
```

The dialog is the shared hardened window in `app/_shared/securePrompt.js` (context isolation, sandbox, no node integration). The entered PIN is returned only through the handler's resolved promise and is never logged or written to disk. The token name and requesting hostname are shown in the dialog to help the user but are never logged, since they can identify the user's employer or card issuer.

Cancelling rejects the request so authentication aborts cleanly rather than looping (an empty-string resolve would re-prompt). A per-token, per-session cap of three prompts guards against draining the card's retry budget; once it is hit the dialog stops appearing until the app restarts, and a wrong PIN shows a card-lockout warning. Configuring the PKCS#11 module itself (for example OpenSC and `modutil` to register the card with NSS) is the user's responsibility. See `docs-site/docs/development/research/smartcard-nss-pin-dialog-research.md` for the full design.
