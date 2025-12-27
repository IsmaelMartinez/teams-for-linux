# Tray Icon Logout Indicator - Research & Implementation

**Status:** ✅ IMPLEMENTED
**Date:** November 2025
**Updated:** December 2025
**Issue:** [#1987 - Change tray icon color if logged out](https://github.com/IsmaelMartinez/teams-for-linux/issues/1987)

---

## Overview

This feature displays a visual indicator on the tray icon and sends a desktop notification when the user's Teams session expires. This helps users who are logged into Teams on multiple machines to detect when they've been logged out without opening the application.

---

## Configuration

The `logoutIndicator` configuration option controls session expiry detection:

```json
{
  "logoutIndicator": {
    "enabled": true,
    "showTrayIndicator": true,
    "showNotification": true,
    "checkIntervalMs": 30000,
    "startupDelayMs": 15000
  }
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | `boolean` | `true` | Enable session expiry detection |
| `showTrayIndicator` | `boolean` | `true` | Show red slash on tray icon when session expires |
| `showNotification` | `boolean` | `true` | Send desktop notification when session expires |
| `checkIntervalMs` | `number` | `30000` | How often to check token expiry (milliseconds) |
| `startupDelayMs` | `number` | `15000` | Delay before first check after app start |

---

## Implementation Details

### Detection Method

The feature uses **localStorage token parsing** to detect session expiry. This was validated through spike testing which found:

- ❌ `_account` property: Returns `undefined` in Teams v2 - NOT usable
- ❌ `getActiveUsers()` method: Returns empty object `{}` - NOT usable
- ✅ **localStorage token parsing: WORKS RELIABLY**

### How It Works

1. **ReactHandler** (`app/browser/tools/reactHandler.js`) monitors MSAL tokens in localStorage
2. Tokens are checked periodically (default: every 30 seconds)
3. If all tokens are expired, an `auth-state-changed` event is dispatched
4. **TrayIconRenderer** (`app/browser/tools/trayIconRenderer.js`) renders a red diagonal slash overlay
5. A desktop notification is sent (if enabled)

### Key Code

```javascript
// Token expiry detection (in ReactHandler)
getAuthenticationState() {
  const tokenKeys = Object.keys(localStorage).filter(k => k.includes('-accesstoken-'));
  for (const key of tokenKeys) {
    const token = JSON.parse(localStorage.getItem(key));
    const expiresOn = token.expiresOn || token.expires_on;
    const expiryMs = expiresOn > 9999999999 ? expiresOn : expiresOn * 1000;
    if (expiryMs > Date.now()) {
      return { authenticated: true, ... };
    }
  }
  return { authenticated: false, ... };
}
```

---

## Testing

Testing tools are available in `app/browser/tools/authSpikes.js`:

```javascript
// View current auth state
window.teamsForLinuxAuthSpikes.viewAuthState()

// Simulate expired session
window.teamsForLinuxAuthSpikes.expireAllTokens()

// Run all validation spikes
window.teamsForLinuxAuthSpikes.runAllSpikes()

// Full logout simulation
window.teamsForLinuxAuthSpikes.clearAllMsalData()
```

---

## Files Changed

- `app/browser/tools/reactHandler.js` - Auth detection and monitoring
- `app/browser/tools/trayIconRenderer.js` - Visual overlay rendering
- `app/browser/preload.js` - ReactHandler module initialization
- `app/config/index.js` - Configuration options
- `app/browser/tools/authSpikes.js` - Testing/validation tools

---

## Related Documentation

- [Configuration Reference](../../configuration.md#logout-indicator)
- [Module Index](../module-index.md)
