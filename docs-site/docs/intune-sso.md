# Intune Integration

This module provides integration with Microsoft Intune for Single Sign-On (SSO) and enterprise management features. It handles authentication flow and ensures compliance with Intune policies.

## Prerequisites

Before enabling Intune SSO, ensure the following components are installed and configured:

### System Requirements

1. **Microsoft Identity Broker**: The `microsoft-identity-broker` service must be installed and running
   - Usually provided by Microsoft Intune Company Portal or similar enterprise software
   - Communicates via D-Bus interface `com.microsoft.identity.broker1`

2. **D-Bus System**: Linux D-Bus system bus must be available and functioning
   - Most Linux distributions have this by default
   - Required for communication with the Identity Broker

3. **Valid Intune Account**: At least one Intune-managed account must be configured
   - Account must have valid Primary Refresh Token (PRT)
   - Account should have appropriate Teams/Office 365 licenses

### Configuration

Enable Intune SSO in your configuration file. You can place the configuration in either:

**User-specific**: `~/.config/teams-for-linux/config.json`
```json
{
  "ssoInTuneEnabled": true,
  "ssoInTuneAuthUser": "user@company.com"
}
```

**System-wide** (common in enterprise environments): `/etc/teams-for-linux/config.json`
```json
{
  "ssoInTuneEnabled": true,
  "ssoInTuneAuthUser": "user@company.com"
}
```

**Configuration Options:**
- `ssoInTuneEnabled`: Enable/disable Intune SSO integration (default: false)
- `ssoInTuneAuthUser`: Specific user account to use (default: "" - uses first available account)

## Troubleshooting

### Common Issues

**1. "Failed to find microsoft-identity-broker DBus interface"**
- Ensure Microsoft Identity Broker is installed and running
- Check if the broker service is accessible: `busctl list | grep microsoft.identity`

**2. "No InTune accounts found"**
- Configure accounts in Microsoft Intune Company Portal
- Verify accounts are properly enrolled and have valid tokens

**3. "Failed to find matching InTune account"**
- Check if `ssoInTuneAuthUser` matches an available account exactly
- Use `[INTUNE_DIAG]` logs to see available accounts

**4. "Failed to retrieve Intune SSO cookie"**
- Account may need reauthentication in Company Portal
- Check if Primary Refresh Token (PRT) is valid

### Debug Logging

Enable debug logging to see detailed Intune diagnostics:

```bash
ELECTRON_ENABLE_LOGGING=true teams-for-linux
```

Look for `[INTUNE_DIAG]` prefixed messages that provide detailed information about:
- SSO initialization status
- Available accounts
- Authentication flow
- Error details and suggestions

### Verification

To verify Intune integration is working:
1. Start teams-for-linux with debug logging enabled
2. Look for `[INTUNE_DIAG] InTune SSO account configured successfully`
3. The app should automatically authenticate

For configuration options related to Intune SSO, please refer to the [Configuration Documentation](./configuration.md).