---
id: 027-app-registration-auth
---

# ADR 027: Custom Azure App Registration Authentication

## Status

✅ Proposed

## Context

In many corporate Azure AD (Entra ID) environments, strict Conditional Access policies enforce mandatory re-authentication every 24 hours. Because Teams for Linux runs as an Electron wrapper around the web application, web session cookies on `login.microsoftonline.com` expire daily, forcing users to repeatedly enter credentials or encounter the "We need you to sign in again" banner.

Standard web sign-in pre-fill (`auth.webLogin.*`) automates credential entry but cannot bypass interactive MFA prompts or token refresh requirements. Intune SSO (`auth.intune.enabled`) requires full corporate Intune enrollment and broker binaries that are not available in all Linux desktop environments.

Users needed a self-service, persistent authentication method that manages OAuth 2.0 refresh tokens securely on the client machine and automatically seeds browser session cookies so Teams starts up cleanly in a signed-in state.

## Decision

We implement a dedicated authentication module (`app/auth/`) that integrates `@azure/msal-node` to authenticate using a user-configured Azure App Registration.

### Key Components

1. **Config Schema (`auth.appRegistration.*`)**:
   - `enabled`: Opt-in flag (default `false`).
   - `clientId`: Azure Application (client) ID.
   - `tenantId`: Directory (tenant) ID or `"common"` (default `"common"`).
   - `authMethod`: `"auto"` (interactive if display available, else deviceCode), `"deviceCode"`, or `"interactive"`.
   - `scopes`: OAuth 2.0 scopes (default `["openid", "profile", "offline_access"]`).
   - `redirectUri`: Native client redirect URI (default `https://login.microsoftonline.com/common/oauth2/nativeclient`).

2. **MSAL Node Integration (`app/auth/authFlow.js`)**:
   - Manages token acquisition using `@azure/msal-node` `PublicClientApplication`.
   - Supports device-code flow (`acquireTokenByDeviceCode`) and PKCE-secured interactive window flow (`acquireTokenByCode`).
   - Interactive flow runs in a dedicated `BrowserWindow` sharing the partition (`persist:teams-4-linux`), establishing session cookies directly in the app session context under the custom App Registration.

3. **Encrypted Token Cache (`app/auth/cache.js`)**:
   - Serializes MSAL token cache and encrypts it using Electron `safeStorage`.
   - Persists encrypted cache in `settingsStore` under key `auth.appRegistration.tokenCache`.

4. **Pre-auth Orchestration (`app/mainAppWindow/index.js`)**:
   - Hook runs during `onAppReady` after cleaning expired cookies but before Teams web page load.
   - On auth failure, logs a warning and degrades gracefully (Teams loads with standard web sign-in).

5. **Device-Code Notification (`app/auth/index.js`)**:
   - Notifies the user via a native Electron modal (`dialog.showMessageBox`), copies the code to the clipboard, and allows opening the verification URL directly in the default browser.

## Alternatives Considered

1. **Intune SSO Broker**:
   - *Pros*: Built-in corporate compliance.
   - *Cons*: Requires Linux Intune agent, corporate device enrollment, and specific distro support.

2. **DOM Token Injection into Teams Web App**:
   - *Pros*: Bypasses redirect flows.
   - *Cons*: Fragile, relies on internal Teams minified JavaScript structures that change frequently.

3. **Continuous Web Form Auto-Submit**:
   - *Pros*: Uses standard web login.
   - *Cons*: Cannot bypass MFA/FIDO2 prompts; requires storing or executing password commands.

## Consequences

- Adds `@azure/msal-node` dependency to `package.json` (lazily loaded only when `auth.appRegistration.enabled` is `true`).
- Requires user to register a custom Public Client App in Azure Portal to use the feature.
- Enforces strict PII log sanitization: `clientId`, `tenantId`, and token contents are never logged.
- Additive design: zero startup overhead and zero effect when `auth.appRegistration.enabled` is `false`.
