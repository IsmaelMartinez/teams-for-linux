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

**Existing Methods** (for proxy/network auth only):
- NTLM Authentication (`app/login/index.js`) - HTTP auth challenges
- SSO Basic Auth - CLI command execution for proxy passwords
- Intune SSO - Enterprise D-Bus integration
- Certificate Authentication - Custom CA certs

**Teams OAuth Login** (what issue requests):
- Managed entirely by Teams web app JavaScript
- Tokens stored in IndexedDB/WebStorage with OS-level encryption
- Main process has no direct access to authentication flow

## Why External Browser Auth Doesn't Work

**Standard Electron OAuth Pattern**: Open system browser → OAuth redirect to custom protocol → app receives tokens → inject into session

**Teams for Linux Problem**: Teams web app manages OAuth internally in JavaScript without exposing token APIs. Even if we obtained tokens externally, Teams web app wouldn't recognize them.

## Technical Feasibility Analysis

Four potential approaches were evaluated, all deemed infeasible:

### Approach 1: Intercept Initial Authentication
**Concept**: Detect authentication and redirect to system browser
**Blockers**: Complex token extraction, requires Azure AD app registration, Teams web app may not accept externally-obtained tokens

### Approach 2: PKCE Flow with Token Exchange
**Concept**: Standard OAuth 2.0 PKCE flow in external browser
**Blockers**: Requires custom Azure AD app per user, Teams expects to manage its own auth, breaking change to existing flows

### Approach 3: Hybrid Optional Mode
**Concept**: Optional external browser auth with fallback
**Blockers**: No clear session transfer mechanism from browser to app, complex fallback logic

### Approach 4: Browser Cookie/Session Import
**Concept**: Import authenticated session from browser
**Blockers**: Security risk, browser-specific implementations, violates browser security models, manual process

## Critical Technical Challenges

**Teams Web App Token Management**: Teams manages authentication internally; externally-obtained tokens may not be recognized. Would require reverse-engineering proprietary token mechanisms.

**OAuth App Registration**: Custom redirect URIs require per-user Azure AD app registration with organizational admin privileges.

**Multiple Authentication Methods**: Risk breaking existing NTLM, SSO Basic Auth, and Intune SSO configurations.

**About:blank Navigation Handling**: Current auth flow detection (`app/mainAppWindow/index.js`) may conflict with external authentication.

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

If circumstances change, research would need to:
- Reverse-engineer Teams web app authentication (analyze network traffic, test token injection)
- Test OAuth flow with custom Azure AD app
- Assess compatibility with existing auth methods (Intune SSO, NTLM, Basic Auth)

### Long-Term: Monitor for Future Opportunities

Keep issue open and monitor for enabling changes:
- Microsoft provides official OAuth app or authentication API for desktop clients
- Electron adds authentication delegation features
- Community discovers working token injection method

**Until then**: Label as "future consideration", welcome community proof-of-concepts

## Alternative Solutions (All Rejected)

**Browser Extension**: Complex bidirectional communication, security concerns with extension permissions

**Proxy-Based Authentication**: Security risk (MITM on localhost), may break TLS certificate validation

**Use Web Version Instead**: Defeats purpose of desktop app, loses all app benefits (tray integration, notifications, screen sharing)

## Conclusion

### Technical Feasibility: **NOT FEASIBLE (Currently)**

External browser authentication for Teams for Linux is **not currently feasible** due to the following blockers:

### Key Blockers

1. Teams web app manages OAuth internally - no exposed token APIs
2. Externally-obtained tokens won't work with Teams web app
3. Would require reverse-engineering (fragile, potentially against ToS)
4. Risk breaking existing auth methods (NTLM, Intune SSO)

**Note**: `ssoBasicAuthPasswordCommand` is for proxy/network auth only, NOT Teams login.

### Recommended Path Forward

1. ❌ **No immediate solution available**
2. 📝 **Document the limitation** - Be transparent that this is not currently possible
3. 🔬 **Keep issue open** - For future opportunities or community solutions
4. 👀 **Monitor for changes** - Microsoft may provide official solution in future
5. 🤝 **Welcome community research** - If someone finds a working approach, consider it

### Response to Issue #2017

> Thank you for this request. Unfortunately, **external browser authentication is not currently feasible**.
>
> **Why**: Teams web app manages OAuth internally in JavaScript without exposed APIs. We can't inject externally-obtained tokens. The `ssoBasicAuthPasswordCommand` config is for proxy/network auth only, not Teams login.
>
> **No workarounds**: Password manager extensions can't access embedded Electron contexts. Session import poses security risks.
>
> **Keeping open**: Labeled "future consideration" in case Microsoft provides official support. Community proof-of-concepts welcome.

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

### Related Code

Authentication: `app/login/`, `app/intune/`, `app/certificate/`, `app/browser/tools/tokenCache.js`
Configuration: `app/config/index.js`, `app/mainAppWindow/`

## Appendix: SSO Basic Auth vs Teams OAuth Login

**Two separate authentication layers**:

- **Network layer** (SSO Basic Auth): Proxy/VPN authentication via `ssoBasicAuthPasswordCommand` - triggered by HTTP 401/407
- **Application layer** (Teams OAuth): Microsoft account login managed by Teams web app JavaScript - no Electron access

Password manager integration is needed for Teams OAuth (application layer), but `ssoBasicAuthPasswordCommand` only works for network auth.

---

**Investigation completed**: 2025-12-12
**Status**: Not feasible - No workaround available
**Next review**: Monitor for Microsoft official guidance or community breakthroughs
