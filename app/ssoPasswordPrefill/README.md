# SSO Password Pre-fill Module

Drives the Microsoft / federated **web** login page so you don't retype
credentials every launch when your organisation expires the Teams session
frequently: fills the email (static value) and password (from a command),
optionally advances each step, and optionally picks an MFA method.

This is different from [`app/login/`](../login/README.md), which handles the
native HTTP Basic/NTLM dialog (`ssoBasicAuthPasswordCommand`). This module never
touches that dialog; it only fills the browser login form.

## How it works

- Attached to the main window in `app/mainAppWindow/index.js`. No-op unless at
  least one of `auth.webLogin.user` / `auth.webLogin.passwordCommand` is configured.
- On `dom-ready` / `did-navigate`, if the current URL is a recognised login host
  it injects one `MutationObserver`-backed script that (a) fills the email field
  with `auth.webLogin.user` as soon as it appears empty, and (b) resolves once a
  visible, editable `input[type="password"]` exists. This covers both the
  single-page email → password transition and federated flows that navigate to
  a separate password host.
- With `auth.webLogin.autoSubmit`, the same observer also advances the flow: clicks
  the **"Pick an account"** tile matching `auth.webLogin.user`, clicks **Next** after
  the email step (the password step's Sign in is clicked by the password-fill
  script), and clicks the **MFA option** whose label starts with
  `auth.webLogin.verifyMethod` on the "Verify your identity" page. All clicks retry
  briefly (Microsoft wires handlers after render) and are retry-capped.
- Only once a password field exists does it run `auth.webLogin.passwordCommand`, take
  the **first line** of stdout, and set it as the field value (via the native
  value setter so React/Angular register the change).
- A generation counter starts a fresh attempt per navigation and lets a stale,
  still-waiting observer bail, so it never blocks the next page.

## Configuration

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `auth.webLogin.user` | string | `""` | Email/username pre-filled into the account field when empty. Empty disables it. |
| `auth.webLogin.passwordCommand` | string | `""` | Shell command whose first stdout line is the password. Empty disables it. |
| `auth.webLogin.extraHosts` | array | `[]` | Extra host suffixes to treat as login pages, in addition to the built-in Microsoft hosts. |
| `auth.webLogin.autoSubmit` | boolean | `false` | Auto-advance: click Next after email, Sign in after password. |
| `auth.webLogin.verifyMethod` | string | `""` | Click the MFA option whose label starts with this text (e.g. `Text`). Empty disables it. |

Built-in login hosts: `login.microsoftonline.com`, `login.microsoft.com`,
`login.live.com`.

Example `config.json`:

```json
{
  "auth": {
    "webLogin": {
      "user": "you@example.org",
      "passwordCommand": "pass show work/teams",
      "autoSubmit": true,
      "verifyMethod": "Text"
    }
  }
}
```

## Limitations

- Attaches to the main window's `webContents`, which is where sign-in happens in
  the default (single-account) setup. In multi-account mode each profile loads
  in its own `BrowserView`, so pre-fill does not currently apply there.
- Fills the first visible, editable `input[type="password"]`. If your identity
  provider renders the password field differently, it may not be detected.
- `auth.webLogin.verifyMethod` is a best-effort text match: it clicks the first
  visible element (searched within `#idDiv_SAOTCS_Proofs`, else the page) whose
  text starts with the configured label. Microsoft DOM/label changes or an
  ambiguous label can make it click the wrong option or nothing; keep the label
  specific (e.g. `Text`) and leave it empty if unreliable for your tenant.

## Security

- The command runs in the **main process** only. Its output goes to the login
  page's renderer solely to set the field value — the same place you'd type it —
  and is never logged, persisted, or sent anywhere else. It lives only in a
  local `const` for the duration of the injection call and is unreachable once
  it returns (error logs carry `error.code` only, never the command's message).
- Injection is gated to the configured login hosts **over HTTPS only**
  (`isLoginUrl` rejects `http:` and other schemes), so the password can never be
  filled into an arbitrary or cleartext site. Covered by `tests/unit/ssoPasswordPrefill.test.js`.
- The app stores no secret itself; sourcing it from your password manager keeps
  the credential under the manager's control (and its own unlock/prompt policy).
