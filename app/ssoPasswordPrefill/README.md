# SSO Password Pre-fill Module

Pre-fills the password field on the Microsoft / federated **web** login page
from a user-defined command, so you don't retype it every launch when your
organisation expires the Teams session frequently.

This is different from [`app/login/`](../login/README.md), which handles the
native HTTP Basic/NTLM dialog (`ssoBasicAuthPasswordCommand`). This module never
touches that dialog; it only fills the browser login form.

## How it works

- Attached to the main window in `app/mainAppWindow/index.js`. No-op unless
  `ssoInAppPasswordCommand` is configured.
- On `dom-ready` / `did-navigate`, if the current URL is a recognised login host
  it injects a small detector (a `MutationObserver`-backed Promise) that waits
  for a visible, editable `input[type="password"]` to appear — this covers the
  single-page email → password transition.
- Only once a password field exists does it run `ssoInAppPasswordCommand`, take
  the **first line** of stdout, and set it as the field value (via the native
  value setter so React/Angular register the change).
- With `ssoInAppAutoSubmit` it then clicks the sign-in button; otherwise it
  leaves submission to you.

## Configuration

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `ssoInAppPasswordCommand` | string | `""` | Shell command whose first stdout line is the password. Empty disables the feature. |
| `ssoInAppLoginHosts` | array | `[]` | Extra host suffixes to treat as login pages, in addition to the built-in Microsoft hosts. |
| `ssoInAppAutoSubmit` | boolean | `false` | Auto-click sign-in after filling. |

Built-in login hosts: `login.microsoftonline.com`, `login.microsoft.com`,
`login.live.com`.

Example `config.json`:

```json
{
  "ssoInAppPasswordCommand": "pass show work/teams"
}
```

## Limitations

- Attaches to the main window's `webContents`, which is where sign-in happens in
  the default (single-account) setup. In multi-account mode each profile loads
  in its own `BrowserView`, so pre-fill does not currently apply there.
- Fills the first visible, editable `input[type="password"]`. If your identity
  provider renders the password field differently, it may not be detected.

## Security

- The command runs in the **main process** only. Its output goes to the login
  page's renderer solely to set the field value — the same place you'd type it —
  and is never logged, persisted, or sent anywhere else. The reference is
  cleared immediately after injection.
- Injection is gated to the configured login hosts, so the password can never be
  filled into an arbitrary site.
- The app stores no secret itself; sourcing it from your password manager keeps
  the credential under the manager's control (and its own unlock/prompt policy).
