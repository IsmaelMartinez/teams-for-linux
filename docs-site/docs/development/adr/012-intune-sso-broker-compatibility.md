---
id: 012-intune-sso-broker-compatibility
---

# ADR 012: Intune SSO Broker Version Compatibility

## Status

Accepted

## Context

The Intune SSO feature in Teams for Linux stopped working with Microsoft Identity Broker versions 2.0.2 and newer. Users reported the error:

```
Broker cannot initialize SSO { error: 'No such interface found', suggestion: 'Ensure Microsoft Identity Broker is installed and running on this system' }
```

### The Problem

Microsoft Identity Broker underwent a complete rewrite in version 2.0.2, introducing breaking changes:

1. **D-Bus Introspection Removed**: Broker versions > 2.0.1 no longer implement the `org.freedesktop.DBus.Introspectable` interface
2. **Response Format Changed**: Cookie data is now nested in a `cookieItems` array
3. **Request Format Changed**: Account parameter must be nested in `authParameters` with explicit `authorizationType`

### Technical Background

The original implementation used `@homebridge/dbus-native`'s `getInterface()` method:

```javascript
// Old approach - relies on D-Bus introspection
brokerService.getInterface(
  "/com/microsoft/identity/broker1",
  "com.microsoft.identity.Broker1",
  (err, broker) => { ... }
);
```

This method internally calls D-Bus introspection to discover available methods. When the broker removed introspection support, this call fails with "No such interface found".

### Research

Analysis of the [linux-entra-sso project](https://github.com/siemens/linux-entra-sso) (PR #116) revealed the solution:
- Use direct D-Bus method invocation instead of relying on introspection
- Detect broker version to determine request/response format
- Handle both old and new formats for backward compatibility

## Decision

**We will use direct D-Bus method invocation with dual response parsing to support all Microsoft Identity Broker versions.**

### Implementation

1. **Direct D-Bus Invocation** (bypass introspection):

```javascript
function invokeBrokerMethod(methodName, request, correlationId = "") {
  return new Promise((resolve, reject) => {
    sessionBus.invoke({
      destination: "com.microsoft.identity.broker1",
      path: "/com/microsoft/identity/broker1",
      interface: "com.microsoft.identity.Broker1",
      member: methodName,
      signature: "sss",
      body: ["0.0", correlationId, JSON.stringify(request)]
    }, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
}
```

2. **Dual Response Parsing** (handles both formats):

```javascript
function extractCookieContent(response) {
  // New format (> 2.0.1): { cookieItems: [{ cookieContent: "..." }] }
  if (response.cookieItems && Array.isArray(response.cookieItems) && response.cookieItems.length > 0) {
    return response.cookieItems[0].cookieContent;
  }
  // Old format (≤ 2.0.1): { cookieContent: "..." }
  return response.cookieContent;
}
```

This approach is simpler than version detection - it uses the standard request format and handles both response formats transparently.

## Consequences

### Positive

- ✅ Supports Microsoft Identity Broker versions ≤ 2.0.1 (legacy)
- ✅ Supports Microsoft Identity Broker versions > 2.0.1 (new)
- ✅ No additional dependencies required
- ✅ Automatic version detection - no user configuration needed
- ✅ Graceful fallback if version detection fails
- ✅ Enhanced diagnostic logging for troubleshooting

### Negative

- ⚠️ More complex codebase with version-specific logic
- ⚠️ Relies on undocumented D-Bus interface (Microsoft doesn't publish specs)
- ⚠️ Future broker versions may require additional changes

### Risks

- Microsoft could change the D-Bus interface again without notice
- The `getLinuxBrokerVersion` method might not be available in all broker versions
- Version comparison logic assumes semantic versioning

### Mitigations

- Comprehensive diagnostic logging with `[INTUNE_DIAG]` prefix
- Graceful fallback to legacy format if version detection fails
- Response parsing handles both formats regardless of detected version

## Alternatives Considered

### Alternative 1: Require Specific Broker Version

Force users to use broker version 2.0.1.

- ❌ Poor user experience
- ❌ Users may not have control over broker version (enterprise deployment)
- ❌ Blocks access to new broker features/fixes

### Alternative 2: Use sso-mib C Library

Replace custom D-Bus code with [sso-mib](https://github.com/siemens/sso-mib) library.

- ✅ Maintained by Siemens
- ✅ Handles version differences automatically
- ❌ Requires native compilation
- ❌ Additional dependency
- ❌ Complicates cross-platform builds

### Alternative 3: Separate Code Paths

Maintain completely separate implementations for old and new brokers.

- ✅ Cleaner separation of concerns
- ❌ Code duplication
- ❌ Higher maintenance burden
- ❌ More potential for bugs

## Notes

- Issue: [teams-for-linux #2047](https://github.com/IsmaelMartinez/teams-for-linux/issues/2047)
- Reference implementation: [linux-entra-sso PR #116](https://github.com/siemens/linux-entra-sso/pull/116)
- D-Bus interface spec: [sso-mib dbus/spec](https://github.com/siemens/sso-mib/blob/main/dbus/spec/com.microsoft.identity.broker1.xml)

## References

- [Microsoft Identity Broker for Linux](https://learn.microsoft.com/en-us/entra/identity/devices/sso-linux)
- [linux-entra-sso project](https://github.com/siemens/linux-entra-sso)
- [linux-entra-sso PR #116](https://github.com/siemens/linux-entra-sso/pull/116) - Reference implementation for broker > 2.0.1 support
- [sso-mib library](https://github.com/siemens/sso-mib)
- [@homebridge/dbus-native](https://github.com/homebridge/dbus-native)
