# External Browser Authentication Investigation

**Issue**: [#2017](https://github.com/IsmaelMartinez/teams-for-linux/issues/2017)
**Status**: Investigation Phase
**Date**: 2025-12-10

## Overview

Investigation into enabling Microsoft Teams authentication to occur in the user's default system browser instead of within the Teams for Linux embedded window. This would improve password manager integration and potentially enable session reuse from existing browser logins.

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

#### Protocol Handler (`app/index.js:91-94`)
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
- Main process only aware via `about:blank` navigation handling (`app/mainAppWindow/index.js:490-508`)

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

### Approach 4: Extend Existing SSO Basic Auth

**Concept**: Enhance existing `ssoBasicAuthPasswordCommand` to support password managers better

#### Implementation Steps
1. **Document Current Capability**: Make it clear that password manager CLI tools work
2. **Add Browser Integration**: Create helper script that opens browser-stored passwords
3. **Improve Documentation**: Clear examples for Bitwarden CLI, 1Password CLI, etc.

#### Pros
- ✅ **Already implemented**: No code changes needed to core app
- ✅ **Works today**: User can integrate password manager CLI immediately
- ✅ **No breaking changes**: Purely additive
- ✅ **Supports existing flows**: Compatible with NTLM, Intune SSO

#### Cons
- ⚠️ **CLI-only**: Requires password manager with CLI interface
- ⚠️ **Not true browser integration**: Still not using browser extensions
- ⚠️ **Documentation/education needed**: Users may not know this exists

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

**Problem**: Current code handles `about:blank` navigations during auth flows (`app/mainAppWindow/index.js:490-508`). External browser auth may bypass or interfere with this.

**Impact**:
- Existing auth flow detection may break
- Hidden window auth completion may not trigger
- Race conditions between internal and external auth

**Mitigation Options**:
- Disable about:blank handling when external auth enabled
- Refactor navigation handling to be auth-method-aware
- Comprehensive testing of all auth scenarios

## Recommendations

### Immediate Action: Document Existing Capability

**Priority: High | Effort: Low | Impact: Medium**

The existing `ssoBasicAuthPasswordCommand` configuration already enables password manager integration via CLI tools. Many password managers provide CLI interfaces:

- **Bitwarden**: `bw get password <item-id>`
- **1Password**: `op read "op://vault/item/password"`
- **LastPass**: `lpass show --password <item-name>`
- **pass**: `pass show <password-name>`

**Action Items**:
1. Create documentation section for password manager integration
2. Provide example configurations for popular password managers
3. Add to FAQ/troubleshooting guide
4. Update issue #2017 with documentation link

**Benefits**:
- ✅ Solves user's password manager integration need TODAY
- ✅ No code changes required
- ✅ Works with existing authentication methods
- ✅ Low risk, high value

### Medium-Term: Research Feasibility

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

### Long-Term: Conditional Implementation

**Priority: Low (pending research) | Effort: Very High | Impact: High**

If research confirms feasibility, consider implementation with strict criteria:

**Implementation Criteria** (ALL must be met):
- ✅ Teams web app accepts externally-obtained tokens
- ✅ Can be implemented without breaking existing auth methods
- ✅ Works without requiring users to create Azure AD apps
- ✅ Provides clear benefit over existing CLI password manager integration
- ✅ Maintainable without Teams web app internals access

**Recommended Architecture** (if proceeding):
- **Optional feature**: `externalBrowserAuth` config (default: false)
- **Protocol callback**: Use existing `msteams://` handler with new `/auth-callback` path
- **Graceful fallback**: If external auth fails, fall back to embedded
- **Clear documentation**: Explain limitations and setup requirements
- **Compatibility checks**: Disable conflicting auth methods when enabled

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

### Alternative 3: User Education Campaign

**Concept**: Comprehensive documentation on existing capabilities

**Pros**:
- No development effort
- Works immediately
- Solves user's stated need (password manager integration)

**Cons**:
- Doesn't provide browser extension integration
- CLI-only solution

**Recommendation**: Start with Alternative 3 (already recommended above)

## Conclusion

### Technical Feasibility: **UNCERTAIN**

External browser authentication for Teams for Linux is **technically complex** and **may not be feasible** without significant reverse-engineering of Teams web application authentication internals.

### Key Blockers

1. **Token compatibility unknown**: Unclear if Teams web app accepts externally-obtained tokens
2. **OAuth app registration**: May require per-user Azure AD app setup
3. **Multiple auth methods**: Risk of breaking existing working configurations
4. **Maintenance burden**: Teams web app auth changes could break external integration

### Recommended Path Forward

1. ✅ **Short-term**: Document existing CLI password manager integration (addresses user's core need)
2. 🔬 **Medium-term**: Research feasibility with proof-of-concept testing
3. ⏸️ **Long-term**: Only implement if research confirms feasibility and clear value over CLI approach

### Response to Issue #2017

**Suggested Response**:

> Thank you for this feature request! Password manager integration is definitely valuable.
>
> **Good news**: Teams for Linux already supports password manager integration via the `ssoBasicAuthPasswordCommand` configuration, which can execute CLI commands from password managers like Bitwarden CLI, 1Password CLI, LastPass CLI, etc.
>
> **Documentation**: We'll create comprehensive documentation with examples for popular password managers.
>
> **External browser authentication**: We've investigated this and it's technically complex. The Teams web application manages its own authentication internally, and external browser authentication would require significant reverse-engineering and may not be compatible with existing authentication methods (NTLM, Intune SSO, Basic Auth).
>
> **Next steps**:
> - We'll add password manager CLI integration documentation
> - We'll keep this issue open for potential future external browser authentication if research shows it's feasible
> - If you'd like to help with research/proof-of-concept testing, we'd welcome contributions!

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
- `app/mainAppWindow/index.js` - Main window, auth flow handling (lines 490-508: about:blank handling)
- `app/mainAppWindow/browserWindowManager.js` - Window creation, session setup
- `app/config/index.js` - Configuration options (lines 407-422: SSO config)

## Appendix: Configuration Examples for Password Managers

### Bitwarden CLI

```json
{
  "ssoBasicAuthUser": "user@example.com",
  "ssoBasicAuthPasswordCommand": "bw get password 'Teams Login'"
}
```

**Prerequisites**:
- Install Bitwarden CLI: `npm install -g @bitwarden/cli`
- Login: `bw login`
- Unlock: `bw unlock` (get session key)
- Store session: `export BW_SESSION="<session-key>"`

### 1Password CLI

```json
{
  "ssoBasicAuthUser": "user@example.com",
  "ssoBasicAuthPasswordCommand": "op read 'op://Personal/Microsoft Teams/password'"
}
```

**Prerequisites**:
- Install 1Password CLI: `https://developer.1password.com/docs/cli/get-started`
- Sign in: `op signin`
- Enable biometric unlock (recommended)

### LastPass CLI

```json
{
  "ssoBasicAuthUser": "user@example.com",
  "ssoBasicAuthPasswordCommand": "lpass show --password 'Microsoft Teams'"
}
```

**Prerequisites**:
- Install LastPass CLI: `https://github.com/lastpass/lastpass-cli`
- Login: `lpass login user@example.com`

### pass (Standard Unix Password Manager)

```json
{
  "ssoBasicAuthUser": "user@example.com",
  "ssoBasicAuthPasswordCommand": "pass show work/microsoft-teams"
}
```

**Prerequisites**:
- Install pass: `apt install pass` / `brew install pass`
- Initialize: `pass init <gpg-key-id>`
- Add password: `pass insert work/microsoft-teams`

---

**Investigation completed**: 2025-12-10
**Next review**: After user feedback on CLI password manager documentation
