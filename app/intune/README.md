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

The module communicates with Microsoft Identity Broker using D-Bus interface `com.microsoft.identity.broker1`:

```javascript
const brokerService = dbus
  .sessionBus()
  .getService("com.microsoft.identity.broker1");
```

### Authentication Flow

1. **Account Discovery**: Retrieves available Intune accounts from Identity Broker
2. **Account Selection**: Uses configured user or selects first available account
3. **PRT Token Acquisition**: Acquires Primary Refresh Token (PRT) for SSO
4. **Request Injection**: Adds SSO credentials to Microsoft authentication requests

### Configuration Integration

The module integrates with the main configuration system to read:
- `ssoInTuneEnabled`: Enable/disable Intune SSO integration
- `ssoInTuneAuthUser`: Specific user account to use for authentication

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