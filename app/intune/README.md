# Intune Integration Module

This module provides integration with Microsoft Intune for Single Sign-On (SSO) and enterprise management features. It handles authentication flow and ensures compliance with Intune policies.

## Architecture

The module consists of the following key components:

- **initSso()**: Initializes Intune SSO by connecting to Microsoft Identity Broker via D-Bus
- **setupUrlFilter()**: Configures URL filtering to intercept Microsoft authentication requests
- **isSsoUrl()**: Determines if a URL should be handled by Intune SSO
- **addSsoCookie()**: Injects SSO credentials into authentication requests

## Technical Implementation

### D-Bus Integration

The module communicates with Microsoft Identity Broker using direct D-Bus method invocation:

```javascript
const BROKER_SERVICE = "com.microsoft.identity.broker1";
const BROKER_PATH = "/com/microsoft/identity/broker1";
const BROKER_INTERFACE = "com.microsoft.identity.Broker1";

// Direct invocation - works with all broker versions
sessionBus.invoke({
  destination: BROKER_SERVICE,
  path: BROKER_PATH,
  interface: BROKER_INTERFACE,
  member: methodName,
  signature: "sss",
  body: [protocolVersion, correlationId, JSON.stringify(request)]
}, callback);
```

### Broker Version Compatibility

The module supports both legacy (≤ 2.0.1) and new (> 2.0.1) Microsoft Identity Broker versions by:

1. **Direct D-Bus invocation** - Bypasses introspection (removed in broker > 2.0.1)
2. **Dual response parsing** - Handles both `cookieContent` and `cookieItems[]` formats

See [ADR-012: Intune SSO Broker Version Compatibility](../../docs-site/docs/development/adr/012-intune-sso-broker-compatibility.md) for technical details.

### Authentication Flow

1. **Account Discovery**: Retrieves available Intune accounts from Identity Broker
2. **Account Selection**: Uses configured user or selects first available account
3. **PRT Token Acquisition**: Acquires Primary Refresh Token (PRT) for SSO
4. **Request Injection**: Adds SSO credentials to Microsoft authentication requests

### Configuration Integration

The module integrates with the main configuration system to read:
- `auth.intune.enabled`: Enable/disable Intune SSO integration
- `auth.intune.user`: Specific user account to use for authentication

Legacy flat options (`ssoInTuneEnabled`, `ssoInTuneAuthUser`) are automatically migrated to the new nested format.

## Diagnostic Logging

The module provides comprehensive diagnostic logging with `[INTUNE_DIAG]` prefixes:
- SSO initialization status and errors
- Available account enumeration
- PRT token acquisition details
- Authentication request processing

## Error Handling

Robust error handling includes:
- D-Bus connection failures
- Missing Identity Broker service
- Account authentication failures
- PRT token acquisition errors

## Dependencies

- `@homebridge/dbus-native`: D-Bus communication with Microsoft Identity Broker
- Microsoft Identity Broker service (system dependency)

## User Documentation

For end-user configuration and troubleshooting, see [docs-site/docs/intune-sso.md](../../docs-site/docs/intune-sso.md).