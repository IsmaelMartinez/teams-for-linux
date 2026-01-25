# Investigation: Intune SSO Regression for Broker Version > 2.0.1

**Issue:** [#2047](https://github.com/IsmaelMartinez/teams-for-linux/issues/2047)
**Date:** 2026-01-25
**Status:** Investigation Complete

## Executive Summary

The Intune SSO feature stopped working with Microsoft Identity Broker versions 2.0.2 and newer. The root cause is that **broker versions > 2.0.1 removed the D-Bus introspection interface**, which the current Teams for Linux implementation relies on to discover and call broker methods.

## Root Cause Analysis

### Error Message
```
Broker cannot initialize SSO { error: 'No such interface found', suggestion: 'Ensure Microsoft Identity Broker is installed and running on this system' }
```

### Technical Details

1. **D-Bus Introspection Removal**: Microsoft Identity Broker versions > 2.0.1 no longer implement the `org.freedesktop.DBus.Introspectable` interface.

2. **Current Implementation Issue**: The `@homebridge/dbus-native` library's `getInterface()` method relies on D-Bus introspection to discover available methods. When introspection fails, the call returns "No such interface found".

3. **Breaking Changes in Broker 2.0.2+**:
   - Removed introspection interface
   - Changed response data structure (cookie data nested deeper in JSON)
   - Modified authentication type parameter requirements

## Current Implementation (`app/intune/index.js`)

```javascript
// Current approach uses getInterface() which requires introspection
brokerService.getInterface(
  "/com/microsoft/identity/broker1",
  "com.microsoft.identity.Broker1",
  (err, broker) => { ... }
);
```

## Required Changes

Based on analysis of the [linux-entra-sso PR #116](https://github.com/siemens/linux-entra-sso/pull/116) which implemented broker > 2.0.1 support:

### 1. Direct D-Bus Method Invocation

Replace `getInterface()` with direct message invocation using the low-level `invoke()` API:

```javascript
const dbus = require("@homebridge/dbus-native");

function invokeMethod(bus, methodName, params) {
  return new Promise((resolve, reject) => {
    bus.invoke({
      destination: "com.microsoft.identity.broker1",
      path: "/com/microsoft/identity/broker1",
      interface: "com.microsoft.identity.Broker1",
      member: methodName,
      signature: "sss",  // Three string parameters
      body: params
    }, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
}
```

### 2. Authentication Type Parameter

For `acquirePrtSsoCookie`, the authentication type must be explicitly set:
- **Type 8**: PRT_SSO_COOKIE (for SSO URL cookie acquisition)
- **Type 1**: CACHED_REFRESH_TOKEN (for other operations)

### 3. Response Parsing Update

Handle both old and new response formats:

```javascript
function extractCookieContent(response) {
  const data = JSON.parse(response);

  // Handle new format (broker > 2.0.1)
  if (data.cookieItems && Array.isArray(data.cookieItems)) {
    return data.cookieItems[0]?.cookieContent;
  }

  // Handle old format (broker <= 2.0.1)
  return data.cookieContent;
}
```

### 4. Request Parameter Structure

The account parameter should be nested within `authParameters`:

```javascript
const request = {
  ssoUrl: url,
  authParameters: {
    authority: "https://login.microsoftonline.com/common/",
    account: inTuneAccount,
    authorizationType: 8  // PRT_SSO_COOKIE
  }
};
```

## D-Bus Interface Specification

For reference, the broker interface ([from sso-mib](https://github.com/siemens/sso-mib/blob/main/dbus/spec/com.microsoft.identity.broker1.xml)):

| Property | Value |
|----------|-------|
| Service Name | `com.microsoft.identity.broker1` |
| Object Path | `/com/microsoft/identity/broker1` |
| Interface Name | `com.microsoft.identity.Broker1` |

| Method | Signature | Description |
|--------|-----------|-------------|
| `getAccounts` | `sss` → `s` | List available accounts |
| `acquirePrtSsoCookie` | `sss` → `s` | Get PRT SSO cookie for authentication |
| `acquireTokenSilently` | `sss` → `s` | Acquire token without user interaction |
| `getLinuxBrokerVersion` | `sss` → `s` | Get broker version |

All methods take three string parameters: `(protocol_version, correlation_id, request_json)` and return a JSON string.

## Implementation Options

### Option A: Direct D-Bus Invocation (Recommended)

Modify `app/intune/index.js` to use the low-level `invoke()` API:

**Pros:**
- No additional dependencies
- Full control over D-Bus message construction
- Works with all broker versions

**Cons:**
- More complex implementation
- Need to handle response parsing for both formats

### Option B: Use sso-mib Library

Replace the custom D-Bus code with the [sso-mib](https://github.com/siemens/sso-mib) C library.

**Pros:**
- Maintained by Siemens
- Handles version differences automatically

**Cons:**
- Requires native compilation
- Additional dependency
- May complicate cross-platform builds

### Option C: Broker Version Detection

Detect broker version and use appropriate method:

```javascript
async function initSso() {
  const version = await getBrokerVersion();
  const isNewBroker = compareVersion(version, "2.0.1") > 0;

  if (isNewBroker) {
    // Use direct invocation
  } else {
    // Use getInterface() for backward compatibility
  }
}
```

**Pros:**
- Maintains backward compatibility
- Graceful degradation

**Cons:**
- More complex codebase
- Need to maintain two code paths

## Recommended Solution

**Option A with version detection** - Implement direct D-Bus invocation as the primary method, with optional fallback for older brokers if needed.

### Implementation Steps

1. **Create helper functions** for direct D-Bus method invocation
2. **Update `getAccounts`** to use direct invocation
3. **Update `acquirePrtSsoCookie`** with new parameter structure
4. **Update response parsing** to handle both formats
5. **Add broker version detection** for logging/diagnostics
6. **Update documentation** and diagnostic messages
7. **Test with both** broker versions 2.0.1 and 2.0.2+

## Testing Requirements

- Test with Microsoft Identity Broker version 2.0.1 (regression test)
- Test with Microsoft Identity Broker version 2.0.2+ (primary target)
- Test with broker not installed (graceful failure)
- Test with broker not running (startup delay handling)
- Verify PRT SSO cookie injection works correctly

## Related Resources

- [linux-entra-sso PR #116](https://github.com/siemens/linux-entra-sso/pull/116) - Broker > 2.0.1 support implementation
- [sso-mib library](https://github.com/siemens/sso-mib) - C library for broker interaction
- [identity_dbus_broker](https://github.com/himmelblau-idm/identity_dbus_broker) - Open source broker implementation
- [@homebridge/dbus-native](https://github.com/homebridge/dbus-native) - D-Bus library used by Teams for Linux
- [AUR package comments](https://aur.archlinux.org/packages/microsoft-identity-broker-bin) - User reports on version 2.0.2 issues

## Appendix: D-Bus Interface XML

```xml
<!DOCTYPE node PUBLIC "-//freedesktop//DTD D-BUS Object Introspection 1.0//EN"
  "http://www.freedesktop.org/standards/dbus/1.0/introspect.dtd">
<node>
  <interface name="com.microsoft.identity.Broker1">
    <method name="getAccounts">
      <arg name="protocol_version" type="s" direction="in"/>
      <arg name="correlation_id" type="s" direction="in"/>
      <arg name="request" type="s" direction="in"/>
      <arg name="response" type="s" direction="out"/>
    </method>
    <method name="acquirePrtSsoCookie">
      <arg name="protocol_version" type="s" direction="in"/>
      <arg name="correlation_id" type="s" direction="in"/>
      <arg name="request" type="s" direction="in"/>
      <arg name="response" type="s" direction="out"/>
    </method>
    <method name="acquireTokenSilently">
      <arg name="protocol_version" type="s" direction="in"/>
      <arg name="correlation_id" type="s" direction="in"/>
      <arg name="request" type="s" direction="in"/>
      <arg name="response" type="s" direction="out"/>
    </method>
    <method name="getLinuxBrokerVersion">
      <arg name="protocol_version" type="s" direction="in"/>
      <arg name="correlation_id" type="s" direction="in"/>
      <arg name="request" type="s" direction="in"/>
      <arg name="response" type="s" direction="out"/>
    </method>
  </interface>
</node>
```
