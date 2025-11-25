# Investigation Report: Issue #1987 - Tray Icon Logout Indicator

**Issue:** [#1987 - Change tray icon color if logged out](https://github.com/IsmaelMartinez/teams-for-linux/issues/1987)

**Date:** 2025-11-25

**Status:** Investigation Complete

## Summary

The user requests a visible indicator in the tray icon when they are logged out of Teams, to immediately recognize logout status without having to check the application window. The user experiences frequent logouts when simultaneously logged into Teams across multiple machines.

## Current Architecture Analysis

### Tray Icon System

The application has a modular tray icon system split between renderer and main processes:

1. **TrayIconRenderer** (`app/browser/tools/trayIconRenderer.js`)
   - Runs in the renderer (browser) process
   - Listens to `unread-count` events from page title mutations
   - Renders tray icons on a canvas with red notification badges for unread messages
   - Sends rendered icons to main process via IPC (`tray-update` channel)
   - Located at: `app/browser/tools/trayIconRenderer.js:1-136`

2. **TrayIconChooser** (`app/browser/tools/trayIconChooser.js`)
   - Selects base icon based on config (`default`, `dark`, or `light` monochrome)
   - Available icons in `app/assets/icons/`:
     - `icon-16x16.png` / `icon-96x96.png` (default colored)
     - `icon-monochrome-dark-16x16.png` / `icon-monochrome-dark-96x96.png` (dark)
     - `icon-monochrome-light-16x16.png` / `icon-monochrome-light-96x96.png` (light)
   - Located at: `app/browser/tools/trayIconChooser.js:1-31`

3. **ApplicationTray** (`app/menus/tray.js`)
   - Runs in main process
   - Receives `tray-update` IPC messages
   - Updates the system tray icon
   - Manages tooltip with unread count
   - Located at: `app/menus/tray.js:1-76`

### Authentication Detection

The application has infrastructure to detect authentication state:

1. **ReactHandler** (`app/browser/tools/reactHandler.js`)
   - Accesses Teams internal React components via DOM inspection
   - Has methods to access `authenticationService` from Teams core services
   - Path to auth provider: `teams2CoreServices.authenticationService._coreAuthService._authProvider`
   - Can acquire tokens via `acquireToken()` method
   - Located at: `app/browser/tools/reactHandler.js:1-308`

2. **TokenCache** (`app/browser/tools/tokenCache.js`)
   - Manages authentication tokens with secure storage
   - Tracks auth-related keys including refresh tokens, MSAL tokens
   - Can provide cache statistics via `getCacheStats()`
   - Located at: `app/browser/tools/tokenCache.js:1-358`

3. **ActivityHub** (`app/browser/tools/activityHub.js`)
   - Calls `ReactHandler.logAuthenticationState()` for authentication monitoring
   - **NOTE:** This method is called but doesn't exist in the current ReactHandler implementation
   - Located at: `app/browser/tools/activityHub.js:64,77`

### Current Icon Rendering Flow

1. Page title changes → `MutationObserverTitle` detects it
2. Extracts unread count from title format `(N) Teams`
3. Dispatches `unread-count` custom event
4. `TrayIconRenderer.updateActivityCount()` receives event
5. Renders icon with red badge if count > 0
6. Sends rendered icon to main process via `tray-update` IPC
7. `ApplicationTray` updates system tray icon

## Implementation Approach Options

### Option 1: Visual Indicator on Icon (Recommended)

Add a visual overlay to indicate logout state without drastic color changes.

**Pros:**
- Non-intrusive, respects user preferences about icon colors
- Can use existing icon rendering infrastructure
- Clear visual distinction

**Cons:**
- Requires creating visual overlay (e.g., red slash, X mark, warning symbol)
- May be less visible on some desktop environments

**Implementation Steps:**
1. Add authentication state detection to `ReactHandler`
2. Create new event type `auth-state-changed` with login status
3. Modify `TrayIconRenderer.render()` to add overlay when logged out
4. Update `ApplicationTray` to handle logout state

### Option 2: OS Notification on Logout

Send a system notification when logout is detected.

**Pros:**
- Immediate user awareness
- Works across all workspaces/virtual desktops
- Uses existing notification infrastructure

**Cons:**
- Notification may be dismissed and forgotten
- Doesn't provide persistent visual indicator
- May be annoying if logouts are frequent

**Implementation Steps:**
1. Add authentication state detection to `ReactHandler`
2. Monitor for logout events
3. Send notification via existing notification system
4. Optional: Include re-login action in notification

### Option 3: Combined Approach (Best User Experience)

Implement both visual indicator and notification.

**Pros:**
- Provides immediate awareness (notification) and persistent indicator (icon)
- Best user experience for the reported use case
- Can be made configurable

**Cons:**
- More complex implementation
- Requires more testing

**Implementation Steps:**
1. Implement authentication state detection
2. Add visual overlay to tray icon when logged out
3. Send notification on logout event
4. Add configuration options for each feature

## Technical Requirements

### 1. Authentication State Detection

Add to `ReactHandler` (`app/browser/tools/reactHandler.js`):

```javascript
/**
 * Check if user is authenticated/logged in to Teams
 * @returns {object} Authentication state information
 */
getAuthenticationState() {
  if (!this._validateTeamsEnvironment()) {
    return { authenticated: false, reason: 'invalid_environment' };
  }

  try {
    const teams2CoreServices = this._getTeams2CoreServices();
    const authService = teams2CoreServices?.authenticationService;

    if (!authService) {
      return { authenticated: false, reason: 'no_auth_service' };
    }

    const authProvider = authService._coreAuthService?._authProvider;

    if (!authProvider) {
      return { authenticated: false, reason: 'no_auth_provider' };
    }

    // Check for active account/tokens
    const account = authProvider._account;
    const hasTokenCache = authProvider._tokenCache !== undefined;

    // Additional checks could include:
    // - Checking for valid access token
    // - Checking token expiration
    // - Checking localStorage for auth tokens

    const authenticated = account !== null && account !== undefined;

    return {
      authenticated: authenticated,
      hasAccount: !!account,
      hasTokenCache: hasTokenCache,
      accountId: account?.id || null
    };

  } catch (error) {
    console.error('[AUTH_STATE] Error checking authentication state:', error);
    return { authenticated: false, reason: 'error', error: error.message };
  }
}

/**
 * Monitor authentication state and dispatch events on changes
 */
startAuthenticationMonitoring() {
  let lastAuthState = null;

  const checkAuthState = () => {
    const currentState = this.getAuthenticationState();

    if (lastAuthState?.authenticated !== currentState.authenticated) {
      console.debug('[AUTH_STATE] Authentication state changed:', currentState);

      // Dispatch custom event
      const event = new CustomEvent('auth-state-changed', {
        detail: currentState
      });
      globalThis.dispatchEvent(event);

      lastAuthState = currentState;
    }
  };

  // Check immediately
  checkAuthState();

  // Check periodically (every 30 seconds)
  setInterval(checkAuthState, 30000);
}
```

### 2. Visual Indicator Rendering

Modify `TrayIconRenderer` (`app/browser/tools/trayIconRenderer.js`):

```javascript
init(config, ipcRenderer) {
  this.ipcRenderer = ipcRenderer;
  this.config = config;
  this.isAuthenticated = true; // Default to authenticated

  const iconChooser = new TrayIconChooser(config);
  this.baseIcon = nativeImage.createFromPath(iconChooser.getFile());
  this.iconSize = this.baseIcon.getSize();

  // Listen to unread count events
  globalThis.addEventListener(
    "unread-count",
    this.updateActivityCount.bind(this),
  );

  // Listen to authentication state changes
  globalThis.addEventListener(
    "auth-state-changed",
    this.updateAuthState.bind(this),
  );
}

updateAuthState(event) {
  const authenticated = event.detail?.authenticated;

  if (this.isAuthenticated !== authenticated) {
    console.debug('[TRAY_AUTH] Authentication state changed:', authenticated);
    this.isAuthenticated = authenticated;

    // Re-render icon with current count and new auth state
    this.updateActivityCount({ detail: { number: this.lastActivityCount || 0 } });
  }
}

_addRedCircleNotification(canvas, image, newActivityCount, resolve) {
  const ctx = canvas.getContext("2d");

  ctx.drawImage(image, 0, 0, 140, 140);

  // Add logout indicator if not authenticated
  if (!this.isAuthenticated) {
    this._addLogoutIndicator(ctx);
  }

  // Add notification badge if there are unread messages
  if (newActivityCount > 0) {
    ctx.fillStyle = "red";
    ctx.beginPath();
    ctx.ellipse(100, 90, 40, 40, 40, 0, 2 * Math.PI);
    ctx.fill();
    ctx.textAlign = "center";
    ctx.fillStyle = "white";

    ctx.font =
      'bold 70px "Segoe UI","Helvetica Neue",Helvetica,Arial,sans-serif';
    if (newActivityCount > 9) {
      ctx.fillText("+", 100, 110);
    } else {
      ctx.fillText(newActivityCount.toString(), 100, 110);
    }
  }

  const resizedCanvas = this._getResizeCanvasWithOriginalIconSize(canvas);
  resolve(resizedCanvas.toDataURL());
}

/**
 * Add a visual indicator for logout state
 * Options:
 * - Red diagonal slash
 * - Red X in corner
 * - Warning triangle
 * - Dimmed/grayed out appearance
 */
_addLogoutIndicator(ctx) {
  // Option 1: Red diagonal slash (like "disabled" icons)
  ctx.strokeStyle = "red";
  ctx.lineWidth = 8;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(20, 20);
  ctx.lineTo(120, 120);
  ctx.stroke();

  // Option 2: Small red X in bottom-left corner (alternative)
  // ctx.fillStyle = "red";
  // ctx.font = 'bold 50px Arial';
  // ctx.fillText("X", 15, 130);

  // Option 3: Warning triangle (alternative)
  // ctx.fillStyle = "#ff6b00"; // Orange
  // ctx.beginPath();
  // ctx.moveTo(30, 130);
  // ctx.lineTo(70, 130);
  // ctx.lineTo(50, 95);
  // ctx.closePath();
  // ctx.fill();
}
```

### 3. Notification on Logout

Add notification when logout is detected:

```javascript
// In ReactHandler after detecting auth state change
if (!currentState.authenticated && lastAuthState?.authenticated) {
  // User just logged out - send notification
  if (this.ipcRenderer) {
    this.ipcRenderer.invoke('show-notification', {
      title: 'Teams for Linux - Logged Out',
      body: 'You have been logged out of Microsoft Teams. Click here to log in again.',
      requireInteraction: true,
      actions: [
        { action: 'relogin', title: 'Log In' }
      ]
    });
  }
}
```

## Missing Implementation: logAuthenticationState()

The `ActivityHub` calls `ReactHandler.logAuthenticationState()` at lines 64 and 77, but this method doesn't exist. This should be implemented:

```javascript
/**
 * Log current authentication state for diagnostics
 * Called by ActivityHub for periodic monitoring
 */
logAuthenticationState() {
  const state = this.getAuthenticationState();
  const tokenStats = this._getTokenCacheStats();

  console.debug('[AUTH_DIAG] Authentication state:', {
    authenticated: state.authenticated,
    hasAccount: state.hasAccount,
    hasTokenCache: state.hasTokenCache,
    accountId: state.accountId ? `${state.accountId.substring(0, 8)}...` : null,
    tokenCacheKeys: tokenStats?.totalKeys || 0,
    refreshTokens: tokenStats?.refreshTokenCount || 0,
    timestamp: new Date().toISOString()
  });

  return state;
}

_getTokenCacheStats() {
  try {
    const TokenCache = require('./tokenCache');
    return TokenCache.getCacheStats();
  } catch (error) {
    console.warn('[AUTH_DIAG] Could not get token cache stats:', error.message);
    return null;
  }
}
```

## Configuration Options

Add new configuration options to allow users to customize the behavior:

```javascript
{
  // Show visual indicator on tray icon when logged out
  "trayIconShowLogoutIndicator": true,

  // Send notification when logout is detected
  "notifyOnLogout": true,

  // Style of logout indicator: "slash", "x", "triangle", "dim"
  "logoutIndicatorStyle": "slash"
}
```

## Testing Considerations

1. **Login State Detection**
   - Test with valid login session
   - Test after manual logout
   - Test after session expiration
   - Test after network disconnection
   - Test with multiple simultaneous logins (user's scenario)

2. **Visual Indicator**
   - Test on different desktop environments (GNOME, KDE, XFCE, etc.)
   - Test with different icon types (default, dark, light)
   - Test with and without notification badges
   - Test icon scaling on different screen DPIs

3. **Notification**
   - Test notification delivery on logout
   - Test re-login action from notification
   - Test notification when app is minimized vs visible

4. **Performance**
   - Monitor overhead of authentication state checking
   - Ensure icon rendering performance is not degraded
   - Check memory usage with frequent state changes

## Potential Challenges

1. **Authentication State Detection Reliability**
   - Teams web app internal structure may change
   - Different auth states (logged out vs session expired vs network issue)
   - Race conditions during app startup

2. **Cross-Platform Compatibility**
   - Tray icon rendering differs between Linux desktop environments
   - Visual indicators may not be visible on all themes
   - Notification support varies across platforms

3. **User Preferences**
   - Some users may not want visual changes (maintainer's concern)
   - Need configurable options
   - Default behavior should be reasonable

## Recommendations

1. **Implement Option 3 (Combined Approach)** with configuration options
   - Visual indicator (configurable style, default: red slash)
   - Notification on logout (configurable, default: enabled)
   - Both features can be individually disabled

2. **Fix Missing Method** - Implement `logAuthenticationState()` in ReactHandler

3. **Iterative Development**
   - Phase 1: Authentication state detection (foundation)
   - Phase 2: Visual indicator on tray icon
   - Phase 3: Notification on logout
   - Phase 4: Configuration options and polish

4. **User Testing** - Get feedback from issue reporter on preferred visual style

## Estimated Effort

- Authentication state detection: 4-6 hours
- Visual indicator implementation: 3-4 hours
- Notification implementation: 2-3 hours
- Configuration options: 2-3 hours
- Testing and refinement: 4-6 hours
- Documentation: 1-2 hours

**Total: 16-24 hours**

## Related Issues

- #1357 - Authentication refresh failures (token cache implementation)
- #1902 - TrayIconRenderer IPC initialization (critical for this feature)
- #1795 - Tray icon timing issues

## Next Steps

1. Discuss implementation approach with maintainer
2. Confirm preferred visual indicator style
3. Decide on configuration defaults
4. Create implementation task list
5. Begin development with authentication state detection
