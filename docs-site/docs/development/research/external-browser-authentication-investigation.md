# External Browser Authentication Investigation

**Issue**: [#2017](https://github.com/IsmaelMartinez/teams-for-linux/issues/2017)
**Status**: Investigation Phase - Not Feasible
**Date**: 2025-12-12

:::warning Critical Clarification
This investigation initially confused **proxy/network authentication** (SSO Basic Auth) with **Microsoft Teams OAuth login**. They are completely separate:
- **SSO Basic Auth** (`ssoBasicAuthPasswordCommand`): Only for proxy/VPN/network-level HTTP authentication (NTLM, Kerberos)
- **Microsoft Teams Login**: OAuth flow within Teams web app - what issue #2017 actually requests

The `ssoBasicAuthPasswordCommand` configuration **does not help** with Microsoft account login or password manager integration for Teams authentication.
:::

## Overview

Investigation into enabling Microsoft Teams authentication to occur in the user's default system browser instead of within the Teams for Linux embedded window. This would improve password manager integration and potentially enable session reuse from existing browser logins.

**Finding**: This feature is **not currently feasible** due to how Teams web application manages authentication internally.

## Problem Statement

### User Request

User wants to:
1. Launch authentication prompts in system's default browser
2. Leverage password manager browser extensions (e.g., Bitwarden)
3. Potentially reuse existing browser sessions to reduce login frequency
4. Avoid manual credential entry across multiple accounts

### Current Behavior

- Authentication occurs within embedded Electron webContents
- Password managers cannot easily interact with embedded browser contexts
- Each login requires manual credential entry
- No session reuse from system browser

## Current Authentication Architecture

### Existing Authentication Methods

Teams for Linux currently supports multiple authentication methods:

#### 1. **NTLM Authentication** (`app/login/index.js`)
- Creates modal BrowserWindow for credential prompts
- Listens for `webContents.on('login')` events
- Supports SSO with basic auth via configuration
- Falls back to manual entry dialog if SSO fails

#### 2. **SSO Basic Auth** (`app/config/index.js`)
- Configuration: `ssoBasicAuthUser`, `ssoBasicAuthPasswordCommand`
- Executes shell command to retrieve password (e.g., from password manager CLI)
- Automatically provides credentials on HTTP auth challenges

#### 3. **Intune SSO** (`app/intune/index.js`)
- Enterprise authentication via Microsoft Identity Broker (D-Bus)
- Configuration: `ssoInTuneEnabled`, `ssoInTuneAuthUser`
- Retrieves Primary Refresh Token (PRT) for SSO
- Injects `X-Ms-Refreshtokencredential` header into Microsoft login requests

#### 4. **Certificate Authentication** (`app/certificate/index.js`)
- Custom CA certificate support for enterprise networks
- Validates certificates against fingerprint whitelist

### Session & Token Management

#### Token Cache (`app/browser/tools/tokenCache.js`)
- Implements Storage interface for Teams authentication tokens
- Uses Electron `safeStorage` API with OS-level encryption
- Manages token types: `tmp.auth.v1.*`, `refresh_token`, `msal.token`, etc.
- Prevents daily re-login requirement

#### Session Storage
- Partition: `persist:teams-4-linux` (configurable)
- IndexedDB and WebStorage preserved for auth tokens
- Cache management explicitly excludes auth storage

### Existing External URL Handling

#### Protocol Handler (`app/index.js`)
- Registers as `msteams://` protocol handler
- Already infrastructure for custom protocol callbacks

#### External Browser Opening
- `shell.openExternal()` for non-Teams URLs
- `defaultURLHandler` configuration for custom browser
- `setWindowOpenHandler` determines in-app vs external opening

## Research: External Browser OAuth in Electron

### Industry Standard Approaches

Modern Electron applications implement external browser OAuth using:

#### **Pattern 1: Custom Protocol Handler + External Browser**
1. Open system browser with OAuth provider URL (Microsoft login)
2. OAuth provider redirects to custom protocol URL after auth (e.g., `msteams://auth-callback?code=...`)
3. App receives protocol callback via `app.on('open-url')` or `app.on('second-instance')`
4. Extract authorization code from callback URL
5. Exchange code for access token
6. Inject tokens into app's session

#### **Pattern 2: Local Callback Server**
1. Start temporary local HTTP server (e.g., `http://localhost:8000/callback`)
2. Open system browser with OAuth URL pointing to localhost redirect
3. Receive authorization code via HTTP request
4. Shut down local server
5. Exchange code for tokens

#### **Pattern 3: Hybrid Approach**
- Use custom protocol as primary mechanism
- Fallback to localhost server if protocol registration fails
- Provides maximum compatibility

### Benefits of External Browser Authentication

Per industry research:
- ✅ **Enhanced Security**: User authenticates in familiar, trusted browser environment
- ✅ **Better UX**: Password managers work seamlessly via browser extensions
- ✅ **Session Reuse**: If already logged into provider in browser, can skip credential entry
- ✅ **Multi-Platform**: Same session can be reused across web, mobile, desktop apps
- ✅ **Reduced Credential Exposure**: No credentials enter Electron app directly

### Challenges

- ⚠️ Requires OAuth authorization code flow (not implicit flow)
- ⚠️ Need to handle token exchange securely
- ⚠️ Complex for applications with multiple authentication paths
- ⚠️ Browser must redirect back to app successfully
- ⚠️ May require custom redirect URI configuration in Microsoft Azure AD

## Microsoft Teams OAuth Flow

### Standard Teams Authentication

Microsoft Teams uses Microsoft Identity Platform (Azure AD) for authentication:

- **Authorization Endpoint**: `https://login.microsoftonline.com/common/oauth2/v2.0/authorize`
- **Token Endpoint**: `https://login.microsoftonline.com/common/oauth2/v2.0/token`
- **Redirect URIs**: Configurable in Azure AD app registration
  - Teams web: `https://teams.microsoft.com/api/platform/v1.0/oAuthRedirect`
  - Custom protocol support: `msteams://teams.microsoft.com/l/auth-callback`

### Teams Web App Authentication

The Teams web application handles authentication internally within its JavaScript context:
1. User navigates to teams.microsoft.com
2. Teams web app redirects to login.microsoftonline.com
3. User authenticates
4. Redirect back to teams.microsoft.com with tokens
5. Tokens stored in localStorage/sessionStorage/IndexedDB

### Current Teams for Linux Behavior

Teams for Linux loads the Teams web app URL and lets it handle authentication within the embedded webContents:
- Authentication happens "invisibly" to the main process
- Tokens managed entirely by Teams web app JavaScript
- Main process only aware via `about:blank` navigation handling (`app/mainAppWindow/index.js`)

## Technical Feasibility Analysis

### Approach 1: Intercept Initial Authentication

**Concept**: Detect when authentication is required and redirect to system browser

#### Implementation Steps
1. **Detection**: Monitor webContents navigation events for login.microsoftonline.com URLs
2. **Interception**: Cancel navigation and capture authentication URL
3. **External Launch**: Open system browser with captured URL
4. **Callback**: Use `msteams://auth-callback` protocol to receive result
5. **Token Injection**: Extract tokens and inject into webContents session

#### Pros
- ✅ Leverages existing protocol handler infrastructure
- ✅ Minimal changes to existing authentication flows
- ✅ User-configurable (can be optional feature)

#### Cons
- ❌ **Complex token extraction**: OAuth code needs to be exchanged for tokens
- ❌ **Requires Azure AD app registration**: Need custom redirect URI
- ❌ **May break existing SSO methods**: Intune SSO, Basic Auth rely on internal flow
- ❌ **Teams web app expects certain token format**: May not accept externally-obtained tokens

### Approach 2: PKCE Flow with Token Exchange

**Concept**: Use OAuth 2.0 PKCE (Proof Key for Code Exchange) flow in external browser

#### Implementation Steps
1. **Generate PKCE challenge**: Create code verifier and challenge
2. **Construct OAuth URL**: Build authorization URL with PKCE parameters
3. **Open Browser**: Launch system browser with OAuth URL
4. **Receive Code**: Protocol callback receives authorization code
5. **Token Exchange**: Exchange code for access token using PKCE verifier
6. **Session Setup**: Create authenticated session with received tokens

#### Pros
- ✅ Standard OAuth 2.0 pattern
- ✅ Enhanced security (PKCE prevents code interception)
- ✅ Works with password managers

#### Cons
- ❌ **Requires custom Azure AD app**: Cannot use Teams' existing OAuth configuration
- ❌ **Complex token management**: Need to maintain tokens separately from Teams web app
- ❌ **May not work with Teams web app**: Teams expects to manage its own auth
- ❌ **Breaking change**: Would fundamentally alter how authentication works

### Approach 3: Hybrid Optional Mode

**Concept**: Add optional configuration to open authentication in external browser while keeping existing flows

#### Implementation Steps
1. **Add Configuration**: `externalBrowserAuth: false` (default: false)
2. **Navigation Interception**: When enabled, intercept login.microsoftonline.com navigations
3. **External Launch**: Open system browser with full authentication URL
4. **Manual Session Import**: After user authenticates in browser, provide mechanism to import session
5. **Fallback**: If external auth fails, fall back to embedded authentication

#### Pros
- ✅ Backward compatible (opt-in feature)
- ✅ Preserves existing authentication methods
- ✅ Less complex than full OAuth implementation
- ✅ User can use password manager in browser

#### Cons
- ⚠️ **Session import challenge**: How to transfer authenticated session from browser to app?
- ⚠️ **Partial solution**: May still require some manual steps
- ⚠️ **Complex fallback logic**: Need to handle failures gracefully

### Approach 4: Browser Cookie/Session Import

**Concept**: After user authenticates in external browser, import session data into Electron app

#### Implementation Steps
1. **User authenticates externally**: Open teams.microsoft.com in system browser
2. **Session export**: Extract cookies/localStorage/sessionStorage from browser
3. **Import mechanism**: Provide tool to import session data into Teams for Linux
4. **Session validation**: Verify imported session works with Teams web app

#### Pros
- ✅ User can use browser password manager
- ✅ No OAuth flow modification needed
- ✅ Simpler than full external OAuth

#### Cons
- ❌ **Security risk**: Exposing session cookies
- ❌ **Complex extraction**: Different per browser (Chrome, Firefox, Edge)
- ❌ **May violate browser security**: Cookie encryption/protection
- ❌ **Manual process**: Not seamless user experience
- ❌ **Maintenance burden**: Browser updates could break extraction

## Critical Technical Challenges

### Challenge 1: Teams Web App Token Management

**Problem**: The Teams web application manages its own authentication state internally. Externally-obtained tokens may not be recognized or properly handled by the Teams JavaScript code.

**Impact**: Even if we obtain valid Microsoft OAuth tokens externally, the Teams web app may:
- Not recognize the token format
- Expect specific cookie/storage structure
- Require additional API calls to establish session
- Use proprietary token exchange mechanisms

**Mitigation Options**:
- Research Teams web app authentication internals (difficult, may change)
- Attempt to reverse-engineer token injection points
- Focus on initial authentication only (not token refresh)

### Challenge 2: OAuth App Registration

**Problem**: To use custom redirect URIs (like `msteams://auth-callback`), the OAuth application must be registered in Azure AD with those redirect URIs explicitly allowed.

**Impact**:
- Users cannot use this feature without creating their own Azure AD app registration
- Requires organizational admin privileges in many cases
- Significantly raises barrier to entry

**Mitigation Options**:
- Provide detailed documentation for Azure AD app setup
- Create helper wizard for app registration
- Investigate if Microsoft provides public OAuth app for Teams

### Challenge 3: Multiple Authentication Methods

**Problem**: Teams for Linux already supports NTLM, SSO Basic Auth, and Intune SSO. External browser authentication may conflict with these.

**Impact**:
- Need to determine precedence order
- Risk breaking existing working setups
- Configuration complexity increases

**Mitigation Options**:
- Make external browser auth mutually exclusive with other methods
- Clear documentation on compatibility
- Configuration validation on startup

### Challenge 4: About:blank Navigation Handling

**Problem**: Current code handles `about:blank` navigations during auth flows (`app/mainAppWindow/index.js`). External browser auth may bypass or interfere with this.

**Impact**:
- Existing auth flow detection may break
- Hidden window auth completion may not trigger
- Race conditions between internal and external auth

**Mitigation Options**:
- Disable about:blank handling when external auth enabled
- Refactor navigation handling to be auth-method-aware
- Comprehensive testing of all auth scenarios

## Recommendations

### Immediate Action: Respond to Issue with Technical Assessment

**Priority: High | Effort: Low | Impact: High**

**Action Items**:
1. Respond to issue #2017 explaining technical infeasibility
2. Clarify that `ssoBasicAuthPasswordCommand` is only for proxy auth, not Teams login
3. Explain why external browser authentication is not currently possible
4. Keep issue open for future research if Teams authentication internals become accessible

**Reasoning**:
- ❌ No immediate workaround exists
- ❌ `ssoBasicAuthPasswordCommand` does not solve the user's actual need
- ❌ External browser OAuth would require reverse-engineering Teams web app
- ⚠️ Feature is technically challenging and may not be achievable

### Medium-Term: Research Feasibility (If Resources Available)

**Priority: Medium | Effort: High | Impact: High**

Before committing to implementation, deeper research is needed:

**Research Tasks**:
1. **Reverse-engineer Teams web app authentication**
   - Analyze network traffic during authentication
   - Identify token storage mechanisms
   - Test if externally-obtained tokens work

2. **Test OAuth flow with Teams backend**
   - Create test Azure AD app with custom redirect URI
   - Attempt authorization code flow with Teams API scopes
   - Verify token exchange and session establishment

3. **Prototype token injection**
   - Build proof-of-concept external browser auth
   - Test token injection into webContents session
   - Validate that Teams web app accepts external tokens

4. **Assess compatibility with existing auth methods**
   - Test interaction with Intune SSO
   - Verify NTLM authentication still works
   - Ensure Basic Auth fallback remains functional

**Expected Outcome**: Clear determination of technical feasibility and implementation complexity

### Long-Term: Monitor for Future Opportunities

**Priority: Low | Effort: Low | Impact: Unknown**

Keep issue open and monitor for changes that might make this feasible:

**Potential Future Enablers**:
- Microsoft provides official OAuth app for desktop clients
- Teams web app exposes authentication API for wrappers
- Electron adds better authentication delegation features
- Community discovers reliable token injection method

**Conditions for Reconsidering**:
- Evidence that externally-obtained tokens work with Teams web app
- Microsoft official guidance for desktop client authentication
- Proven proof-of-concept from community members
- Clear implementation path that doesn't require reverse-engineering

**For Now**:
- Keep issue #2017 open for visibility
- Label as "future consideration" or "help wanted"
- Welcome community research and proof-of-concepts
- Document findings if anyone attempts implementation

## Alternative Solutions

### Alternative 1: Browser Extension for Teams

**Concept**: Create browser extension that syncs authentication state with Teams for Linux

**Pros**:
- Full browser password manager access
- Native browser session reuse

**Cons**:
- Requires separate extension installation
- Complex bidirectional communication
- Security concerns with extension permissions

### Alternative 2: Proxy-Based Authentication

**Concept**: Run local proxy that intercepts authentication requests and injects credentials

**Pros**:
- Transparent to Teams web app
- No app code changes needed

**Cons**:
- Security risk (MITM on localhost)
- Complex proxy logic
- May break TLS certificate validation

### Alternative 3: Use Web Version Instead of App

**Concept**: User abandons Teams for Linux and uses teams.microsoft.com in regular browser

**Workflow**:
1. Open teams.microsoft.com in system browser (Chrome, Firefox, etc.)
2. Use password manager browser extension to login
3. Use web version exclusively instead of desktop app

**Pros**:
- Password manager browser extensions work perfectly
- No development needed
- Full browser features available

**Cons**:
- ❌ **Not a solution for Teams for Linux** - completely defeats the purpose of using the desktop app
- ❌ **Loses all desktop app benefits**: system tray integration, notifications, screen sharing optimizations, etc.
- ❌ **Separate sessions**: Browser and app don't share authentication
- User asked for desktop app with password manager integration, not "use the web version"

**Recommendation**: NOT a viable alternative - user wants the desktop app to work with password managers

## Conclusion

### Technical Feasibility: **NOT FEASIBLE (Currently)**

External browser authentication for Teams for Linux is **not currently feasible** due to the following blockers:

### Key Blockers

1. **Teams web app controls authentication internally**: The Teams JavaScript application manages OAuth flow without exposing APIs for external token injection
2. **Token compatibility unknown**: No evidence that externally-obtained OAuth tokens work with Teams web app
3. **No official Microsoft support**: No documented way for desktop wrappers to implement external browser OAuth
4. **Reverse-engineering required**: Would need to reverse-engineer Teams web app authentication, which is:
   - Fragile (breaks with Teams updates)
   - Potentially against Microsoft ToS
   - Unsustainable long-term
5. **Multiple auth methods**: Risk of breaking existing working configurations (NTLM, Intune SSO, Basic Auth)

### Critical Clarification

**Important**: The existing `ssoBasicAuthPasswordCommand` configuration is **only for proxy/network authentication**, not Microsoft Teams login. It does not solve the password manager integration need described in issue #2017.

### Recommended Path Forward

1. ❌ **No immediate solution available**
2. 📝 **Document the limitation** - Be transparent that this is not currently possible
3. 🔬 **Keep issue open** - For future opportunities or community solutions
4. 👀 **Monitor for changes** - Microsoft may provide official solution in future
5. 🤝 **Welcome community research** - If someone finds a working approach, consider it

### Response to Issue #2017

**Suggested Response**:

> Thank you for this feature request! Unfortunately, after thorough investigation, **external browser authentication is not currently feasible** for Teams for Linux.
>
> **Why it's not possible:**
> - The Teams web application manages Microsoft account authentication internally via JavaScript
> - There's no exposed API for external token injection or authentication delegation
> - Implementing this would require reverse-engineering Teams web app authentication, which is fragile and unsustainable
> - The `ssoBasicAuthPasswordCommand` configuration only works for proxy/network authentication, not Microsoft Teams OAuth login
>
> **No workaround available:**
> - Password manager browser extensions cannot interact with the embedded Electron browser context
> - CLI password managers (`ssoBasicAuthPasswordCommand`) only help with proxy authentication, not Teams login
> - Session import from external browser poses security risks and browser compatibility issues
>
> **Keeping this open:**
> - We'll keep this issue open as "future consideration" in case circumstances change
> - If Microsoft provides official guidance for desktop client authentication, we can revisit
> - Community contributions for proof-of-concept research are welcome
>
> We understand this is frustrating, and we wish we had better news. The technical constraints are significant, but we'll continue monitoring for future opportunities.
>
> **Note**: Using teams.microsoft.com in a regular browser would create a completely separate session from Teams for Linux (different browser contexts/storage) and is not a workaround for authentication within the app.

## References

### External Resources

- [Build and Secure an Electron App - Auth0](https://auth0.com/blog/securing-electron-applications-with-openid-connect-and-oauth-2/)
- [Add Auth to an Electron App Using OIDC - Descope](https://www.descope.com/blog/post/electron-auth-oidc)
- [Electron OAuth2 Library - GitHub](https://github.com/mawie81/electron-oauth2)
- [Microsoft Identity Platform OAuth 2.0 Flow](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow)
- [OAuth for Teams Message Extensions](https://learn.microsoft.com/en-us/microsoftteams/platform/messaging-extensions/api-based-oauth)
- [Teams Authentication Overview](https://learn.microsoft.com/en-us/microsoftteams/platform/concepts/authentication/authentication)

### Internal Documentation

- [Configuration Reference](../../configuration.md)
- [Intune SSO Documentation](../../intune-sso.md)
- [Contributing Guide](../contributing.md)

### Related Code Files

- `app/login/index.js` - NTLM login dialog
- `app/intune/index.js` - Intune SSO via D-Bus
- `app/certificate/index.js` - Certificate validation
- `app/browser/tools/tokenCache.js` - Token storage
- `app/mainAppWindow/index.js` - Main window, auth flow handling (about:blank navigation handling)
- `app/mainAppWindow/browserWindowManager.js` - Window creation, session setup
- `app/config/index.js` - Configuration options (SSO config)

## Appendix: SSO Basic Auth vs Teams OAuth Login

### Understanding the Distinction

This investigation initially confused two completely different authentication mechanisms:

#### SSO Basic Auth (`ssoBasicAuthPasswordCommand`)
- **What it is**: Electron's `webContents.on('login')` event handler
- **When it triggers**: HTTP 401/407 responses requiring Basic/NTLM/Kerberos auth
- **Use cases**:
  - Corporate proxy authentication (most common)
  - VPN gateway authentication
  - Internal corporate web resources with HTTP auth
- **Configuration example**:
  ```json
  {
    "ssoBasicAuthUser": "corp-username",
    "ssoBasicAuthPasswordCommand": "secret-tool lookup proxy-password"
  }
  ```
- **Code location**: `app/login/index.js` - `webContents.on('login')` event handler
- **Documentation**: Network-level authentication, not Teams login

#### Microsoft Teams OAuth Login
- **What it is**: OAuth 2.0 flow managed by Teams web app JavaScript
- **When it triggers**: When navigating to login.microsoftonline.com for Microsoft account
- **Use cases**:
  - Initial Teams account login
  - Multi-factor authentication (MFA)
  - Account switching
  - Session refresh after expiry
- **Managed by**: Teams web application (not Electron main process)
- **What issue #2017 requests**: Password manager integration for THIS authentication
- **Current behavior**: Happens invisibly within webContents, no external access

### Why the Confusion Occurred

The terminology "SSO" and "authentication" made it seem like `ssoBasicAuthPasswordCommand` might help with Teams login, but these are entirely separate authentication layers:

- **Network layer** (SSO Basic Auth): Getting through proxy/firewall to reach Microsoft servers
- **Application layer** (Teams OAuth): Authenticating your Microsoft account with Teams service

Password manager integration is needed at the **application layer**, but `ssoBasicAuthPasswordCommand` only works at the **network layer**.

---

**Investigation completed**: 2025-12-12
**Status**: Not feasible - No workaround available
**Next review**: Monitor for Microsoft official guidance or community breakthroughs
