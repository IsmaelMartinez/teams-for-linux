# Tray Icon Logout Indicator - Research & Implementation Plan

**Status:** Research Complete - Awaiting Technical Validation
**Date:** November 2025
**Issue:** [#1987 - Change tray icon color if logged out](https://github.com/IsmaelMartinez/teams-for-linux/issues/1987)
**Author:** Claude AI Assistant
**Priority:** Enhancement - User Experience Improvement

---

## Executive Summary

This document provides comprehensive research and implementation planning for adding a visual logout indicator to the system tray icon. The user requests this feature to immediately recognize when they've been logged out of Teams (particularly due to multi-device conflicts) without having to check the application window.

:::warning Critical Technical Uncertainty
This feature has **HIGH technical risk** due to reliance on Teams internal React structure for authentication detection. **Technical validation spikes must be completed** before proceeding with implementation to confirm the approach is viable.
:::

### Key Findings

- ✅ **Architecture exists:** Tray icon system is modular and well-structured
- ✅ **Access possible:** ReactHandler can theoretically access Teams authentication service
- ⚠️ **Detection unvalidated:** Authentication state detection method needs verification
- ⚠️ **IPC prerequisite:** ReactHandler requires `ipcRenderer` access (currently missing)
- ⚠️ **False positive risk:** High risk of incorrect logout detection during app startup
- ⚠️ **Stability concern:** Relies on Teams internal structure that could change

### Recommended Approach

**Option 3: Combined Visual + Notification** (configurable)
- Visual overlay on tray icon (red slash, X, or warning symbol)
- OS notification when logout detected
- Both features individually configurable
- Multi-signal detection to improve reliability

### Effort Estimate

| Phase | Hours |
|-------|-------|
| Technical validation spikes | 16-28 |
| Implementation | 16-24 |
| Testing and refinement | 6-8 |
| **Total** | **38-60 hours** |

---

## 1. Problem Statement

### User Scenario

The user experiences frequent logouts when simultaneously logged into Teams across multiple machines. They need:

1. **Immediate awareness** when logged out (regardless of current workspace)
2. **Persistent indicator** (not just a dismissible notification)
3. **Visual distinction** that doesn't require opening the application

### Current Behavior

- No indication in tray icon when logged out
- User discovers logout only when attempting to use the application
- Tray icon looks identical whether logged in or out

### Proposed Solutions

**Original Request:** Change tray icon color (e.g., to red) when logged out

**Maintainer Concern:** Some users dislike drastic visual modifications

**Refined Approach:** Subtle overlay (slash, X, or badge) instead of full color change

---

## 2. Current Architecture Analysis

### 2.1 Tray Icon System

The application has a modular tray icon system split between processes:

#### TrayIconRenderer (`app/browser/tools/trayIconRenderer.js`)

**Purpose:** Runs in renderer process, renders tray icons with notification badges

**Key Methods:**
- `init(config, ipcRenderer)` - Initialize with base icon
- `updateActivityCount(event)` - Renders icon with red badge when unread messages exist
- `render(count)` - Creates canvas with icon + notification badge
- `_addRedCircleNotification()` - Draws red circle with count overlay

**Current Flow:**
```
1. Listens to 'unread-count' events from page title mutations
2. Renders icon on canvas with red notification badge (if count > 0)
3. Sends rendered icon to main process via 'tray-update' IPC
```

**Location:** `app/browser/tools/trayIconRenderer.js:1-136`

#### TrayIconChooser (`app/browser/tools/trayIconChooser.js`)

**Purpose:** Selects base icon based on configuration

**Icon Types:**
- `default` - Colored icons (16x16, 96x96)
- `dark` - Monochrome dark (16x16, 96x96)
- `light` - Monochrome light (16x16, 96x96)
- Custom path support via `config.appIcon`

**Location:** `app/browser/tools/trayIconChooser.js:1-31`

#### ApplicationTray (`app/menus/tray.js`)

**Purpose:** Main process, manages system tray icon

**Key Methods:**
- `updateTrayImage(iconUrl, flash, count)` - Updates tray icon and tooltip
- `#handleTrayUpdate()` - Receives IPC messages from renderer

**Current Behavior:**
- Updates tooltip with unread count: `Teams (5)`
- Flashes window on new notifications

**Location:** `app/menus/tray.js:1-76`

### 2.2 Authentication Detection Infrastructure

#### ReactHandler (`app/browser/tools/reactHandler.js`)

**Purpose:** Accesses Teams internal React components and services

**Capabilities:**
- Validates Teams environment (domain, document, React structure)
- Accesses `teams2CoreServices` via React internals
- Can reach authentication service: `teams2CoreServices.authenticationService._coreAuthService._authProvider`
- Already has `acquireToken()` method for Graph API

**Current Status:**
- ⚠️ Does NOT receive `ipcRenderer` in `init()` method
- ⚠️ Not in preload.js modules array for initialization
- ✅ Has validation and environment checking infrastructure

**Location:** `app/browser/tools/reactHandler.js:1-308`

#### TokenCache (`app/browser/tools/tokenCache.js`)

**Purpose:** Manages authentication tokens with secure storage

**Capabilities:**
- Tracks auth-related localStorage keys
- Recognizes token patterns (refresh_token, msal.token, etc.)
- Provides `getCacheStats()` for diagnostics

**Potential Use:** Could check token presence as authentication signal

**Location:** `app/browser/tools/tokenCache.js:1-358`

#### ActivityHub (`app/browser/tools/activityHub.js`)

**Purpose:** Monitors Teams activity and manages event subscriptions

**Authentication Monitoring:**
- Calls `ReactHandler.logAuthenticationState()` at lines 64, 77
- ⚠️ **Bug:** This method doesn't exist in ReactHandler!
- Periodic monitoring every 5 minutes intended

**Location:** `app/browser/tools/activityHub.js:1-273`

### 2.3 Event Flow for Tray Updates

```
1. Page Title Changes
   └─> MutationObserverTitle detects (app/browser/tools/mutationTitle.js)
       └─> Extracts unread count from "(N) Teams" format
           └─> Dispatches 'unread-count' custom event
               └─> TrayIconRenderer.updateActivityCount() receives
                   └─> Renders icon with badge
                       └─> Sends 'tray-update' IPC to main process
                           └─> ApplicationTray updates system tray
```

**Proposed Addition:**
```
2. Authentication State Changes
   └─> ReactHandler monitors auth service
       └─> Detects logout
           └─> Dispatches 'auth-state-changed' custom event
               └─> TrayIconRenderer.updateAuthState() receives
                   └─> Re-renders with logout overlay
                       └─> Updates tray icon
               └─> ReactHandler sends notification (if configured)
```

---

## 3. Implementation Approach Options

### Option 1: Visual Indicator Only

**Description:** Add overlay to tray icon when logged out (slash, X, warning symbol)

**Pros:**
- Non-intrusive, respects user preferences about color changes
- Uses existing rendering infrastructure
- Persistent indicator visible across all workspaces
- Configurable overlay style

**Cons:**
- May be less visible on some desktop environments
- Requires creating visual overlay assets
- User must look at tray to notice

**Estimated Effort:** 12-16 hours (after spikes)

### Option 2: Notification Only

**Description:** Send OS notification when logout detected

**Pros:**
- Immediate user awareness
- Works across all workspaces/virtual desktops
- Uses existing notification infrastructure
- Simple to implement

**Cons:**
- Notification can be dismissed and forgotten
- No persistent visual indicator
- May be annoying if logouts frequent
- Doesn't help if user returns to computer later

**Estimated Effort:** 8-12 hours (after spikes)

### Option 3: Combined Approach ⭐ **RECOMMENDED**

**Description:** Both visual indicator AND notification (independently configurable)

**Pros:**
- ✅ Immediate awareness (notification)
- ✅ Persistent indicator (icon overlay)
- ✅ Best user experience for reported scenario
- ✅ Flexible - users can enable/disable each feature
- ✅ Covers all use cases (immediate + later discovery)

**Cons:**
- More complex implementation
- More testing required
- Higher maintenance burden

**Estimated Effort:** 16-24 hours (after spikes)

---

## 4. Technical Requirements

### 4.1 Critical Prerequisite: IPC Access for ReactHandler

:::danger Blocking Issue
ReactHandler currently does **NOT** have access to `ipcRenderer`, which is required for sending logout notifications. This must be fixed before notification functionality can be implemented.
:::

**Current State:**
```javascript
// In reactHandler.js
init(config) {
  this.config = config;
  console.debug('[ReactHandler] Initialized');
}
```

**Required Change:**
```javascript
// Update ReactHandler.init() signature
init(config, ipcRenderer) {
  this.config = config;
  this.ipcRenderer = ipcRenderer;  // Add this
  console.debug('[ReactHandler] Initialized', {
    hasIpcRenderer: !!ipcRenderer
  });
}
```

**Preload.js Changes Required:**

Two options for implementation:

**Option A: Add to modules array** (Recommended)
```javascript
// In preload.js - Add to modules array
const modules = [
  { name: "zoom", path: "./tools/zoom" },
  { name: "shortcuts", path: "./tools/shortcuts" },
  { name: "settings", path: "./tools/settings" },
  { name: "theme", path: "./tools/theme" },
  { name: "emulatePlatform", path: "./tools/emulatePlatform" },
  { name: "timestampCopyOverride", path: "./tools/timestampCopyOverride" },
  { name: "trayIconRenderer", path: "./tools/trayIconRenderer" },
  { name: "mqttStatusMonitor", path: "./tools/mqttStatusMonitor" },
  { name: "disableAutogain", path: "./tools/disableAutogain" },
  { name: "navigationButtons", path: "./tools/navigationButtons" },
  { name: "reactHandler", path: "./tools/reactHandler" }  // <-- Add this
];

// Update conditional to pass ipcRenderer
if (module.name === "settings" ||
    module.name === "theme" ||
    module.name === "trayIconRenderer" ||
    module.name === "mqttStatusMonitor" ||
    module.name === "reactHandler") {  // <-- Add this
  moduleInstance.init(config, ipcRenderer);
} else {
  moduleInstance.init(config);
}
```

**Option B: Initialize in ActivityHub**
```javascript
// In activityHub.js
const ReactHandler = require("./reactHandler");
const { ipcRenderer } = require("electron");

// Initialize with ipcRenderer
ReactHandler.init(config, ipcRenderer);
```

### 4.2 Authentication State Detection

Add to ReactHandler:

```javascript
/**
 * Check if user is authenticated/logged in to Teams
 * @returns {object} Authentication state information
 */
getAuthenticationState() {
  if (!this._validateTeamsEnvironment()) {
    return {
      authenticated: false,
      reason: 'invalid_environment',
      confidence: 0
    };
  }

  try {
    const teams2CoreServices = this._getTeams2CoreServices();
    const authService = teams2CoreServices?.authenticationService;

    if (!authService) {
      return {
        authenticated: false,
        reason: 'no_auth_service',
        confidence: 0.2
      };
    }

    const authProvider = authService._coreAuthService?._authProvider;

    if (!authProvider) {
      return {
        authenticated: false,
        reason: 'no_auth_provider',
        confidence: 0.3
      };
    }

    // Check for active account
    const account = authProvider._account;
    const authenticated = account !== null && account !== undefined;

    return {
      authenticated: authenticated,
      hasAccount: !!account,
      hasTokenCache: authProvider._tokenCache !== undefined,
      accountId: account?.id || null,
      confidence: authenticated ? 0.9 : 0.7,
      method: 'react_internals'
    };

  } catch (error) {
    console.error('[AUTH_STATE] Error checking authentication state:', error);
    return {
      authenticated: false,
      reason: 'error',
      error: error.message,
      confidence: 0
    };
  }
}
```

### 4.3 Authentication Monitoring

Add monitoring with smart timing and debouncing:

```javascript
/**
 * Monitor authentication state and dispatch events on changes
 */
startAuthenticationMonitoring() {
  // Wait for Teams to fully load before starting
  this._waitForTeamsReady().then(() => {
    console.debug('[AUTH_STATE] Teams ready, starting authentication monitoring');

    // Establish baseline state
    let lastAuthState = this.getAuthenticationState();
    console.debug('[AUTH_STATE] Baseline state:', lastAuthState);

    // Periodic checking
    const checkAuthState = () => {
      const currentState = this.getAuthenticationState();

      // State changed - but debounce to confirm stability
      if (lastAuthState?.authenticated !== currentState.authenticated) {
        console.debug('[AUTH_STATE] State change detected, debouncing...');

        if (this._stateChangeDebounce) {
          clearTimeout(this._stateChangeDebounce);
        }

        this._stateChangeDebounce = setTimeout(() => {
          // Verify state still changed after debounce
          const verifiedState = this.getAuthenticationState();

          if (verifiedState.authenticated === currentState.authenticated) {
            this._handleAuthStateChange(verifiedState, lastAuthState);
            lastAuthState = verifiedState;
          }
        }, 3000); // 3 second debounce
      }
    };

    // Check every 30 seconds
    setInterval(checkAuthState, 30000);

    // Initial check
    checkAuthState();
  });
}

/**
 * Wait for Teams application to fully load
 * @private
 */
_waitForTeamsReady() {
  return new Promise((resolve) => {
    const maxAttempts = 30; // 30 seconds max wait
    let attempts = 0;

    const check = () => {
      attempts++;

      if (this._isTeamsFullyLoaded()) {
        console.debug('[AUTH_STATE] Teams fully loaded after', attempts, 'seconds');
        resolve();
      } else if (attempts >= maxAttempts) {
        console.warn('[AUTH_STATE] Teams load timeout after', maxAttempts, 'seconds');
        resolve(); // Continue anyway
      } else {
        setTimeout(check, 1000); // Check every second
      }
    };

    check();
  });
}

/**
 * Check if Teams is fully loaded and ready
 * @private
 */
_isTeamsFullyLoaded() {
  // Multiple checks to ensure Teams is ready
  const hasReactStructure = this._validateReactStructure();
  const hasCoreServices = !!this._getTeams2CoreServices();
  const notOnLoginPage = !window.location.href.includes('/login');

  return hasReactStructure && hasCoreServices && notOnLoginPage;
}

/**
 * Handle confirmed authentication state change
 * @private
 */
_handleAuthStateChange(currentState, previousState) {
  console.debug('[AUTH_STATE] Authentication state changed:', {
    previous: previousState?.authenticated,
    current: currentState.authenticated,
    confidence: currentState.confidence
  });

  // Send notification on logout (if configured and high confidence)
  if (!currentState.authenticated &&
      previousState?.authenticated &&
      currentState.confidence > 0.6) {
    this._sendLogoutNotification();
  }

  // Dispatch custom event for tray icon update
  const event = new CustomEvent('auth-state-changed', {
    detail: currentState
  });
  globalThis.dispatchEvent(event);
}

/**
 * Send notification when user is logged out
 * @private
 */
_sendLogoutNotification() {
  if (!this.ipcRenderer) {
    console.warn('[AUTH_STATE] Cannot send logout notification - ipcRenderer not available');
    return;
  }

  if (!this.config?.notifyOnLogout) {
    console.debug('[AUTH_STATE] Logout notifications disabled in config');
    return;
  }

  try {
    this.ipcRenderer.invoke('show-notification', {
      title: 'Teams for Linux - Logged Out',
      body: 'You have been logged out of Microsoft Teams. Click to view the application.',
      requireInteraction: true,
      urgency: 'normal'
    }).catch(error => {
      console.error('[AUTH_STATE] Failed to send logout notification:', error);
    });
  } catch (error) {
    console.error('[AUTH_STATE] Error sending logout notification:', error);
  }
}
```

### 4.4 Visual Indicator Rendering

Modify TrayIconRenderer to add logout overlay:

```javascript
init(config, ipcRenderer) {
  this.ipcRenderer = ipcRenderer;
  this.config = config;
  this.isAuthenticated = true; // Default to authenticated
  this.lastActivityCount = 0;

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

  console.debug('[TRAY_AUTH] TrayIconRenderer initialized with auth monitoring');
}

/**
 * Handle authentication state changes
 */
updateAuthState(event) {
  const authenticated = event.detail?.authenticated;
  const confidence = event.detail?.confidence || 0;

  // Only update if high confidence
  if (confidence < 0.6) {
    console.debug('[TRAY_AUTH] Ignoring low confidence auth state:', confidence);
    return;
  }

  if (this.isAuthenticated !== authenticated) {
    console.debug('[TRAY_AUTH] Authentication state changed:', authenticated);
    this.isAuthenticated = authenticated;

    // Re-render icon with current count and new auth state
    this.updateActivityCount({
      detail: { number: this.lastActivityCount || 0 }
    });
  }
}

/**
 * Add red circle notification badge and logout overlay if needed
 */
_addRedCircleNotification(canvas, image, newActivityCount, resolve) {
  const ctx = canvas.getContext("2d");

  // Draw base icon
  ctx.drawImage(image, 0, 0, 140, 140);

  // Add logout indicator if not authenticated (and feature enabled)
  if (!this.isAuthenticated && this.config?.trayIconShowLogoutIndicator !== false) {
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
 * Add visual indicator for logout state
 * @private
 */
_addLogoutIndicator(ctx) {
  const style = this.config?.logoutIndicatorStyle || 'slash';

  switch (style) {
    case 'slash':
      // Red diagonal slash (like "disabled" icons)
      ctx.strokeStyle = "#ff0000";
      ctx.lineWidth = 8;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(20, 20);
      ctx.lineTo(120, 120);
      ctx.stroke();
      break;

    case 'x':
      // Red X in corner
      ctx.fillStyle = "#ff0000";
      ctx.font = 'bold 50px Arial';
      ctx.textAlign = "left";
      ctx.fillText("✗", 10, 50);
      break;

    case 'triangle':
      // Warning triangle
      ctx.fillStyle = "#ff6b00"; // Orange
      ctx.beginPath();
      ctx.moveTo(30, 130);
      ctx.lineTo(70, 130);
      ctx.lineTo(50, 95);
      ctx.closePath();
      ctx.fill();

      // Exclamation mark
      ctx.fillStyle = "white";
      ctx.font = 'bold 20px Arial';
      ctx.textAlign = "center";
      ctx.fillText("!", 50, 120);
      break;

    case 'dim':
      // Dim the entire icon
      ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
      ctx.fillRect(0, 0, 140, 140);
      break;

    default:
      console.warn('[TRAY_AUTH] Unknown logout indicator style:', style);
  }
}
```

### 4.5 Missing Implementation: logAuthenticationState()

The ActivityHub calls this method but it doesn't exist:

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
    confidence: state.confidence,
    method: state.method,
    tokenCacheKeys: tokenStats?.totalKeys || 0,
    refreshTokens: tokenStats?.refreshTokenCount || 0,
    timestamp: new Date().toISOString()
  });

  return state;
}

/**
 * Get token cache statistics
 * @private
 */
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

### 4.6 Configuration Schema

Add new configuration options:

```javascript
{
  // Visual indicator on tray icon when logged out
  "trayIconShowLogoutIndicator": true,

  // Send notification when logout detected
  "notifyOnLogout": true,

  // Style of logout indicator: "slash", "x", "triangle", "dim"
  "logoutIndicatorStyle": "slash",

  // Minimum confidence threshold for logout detection (0.0-1.0)
  "logoutDetectionConfidenceThreshold": 0.6,

  // Debounce time in ms before confirming state change
  "logoutDetectionDebounceMs": 3000,

  // Enable debug logging for authentication detection
  "debugAuthDetection": false
}
```

---

## 5. Critical Gaps & Technical Risks

:::warning High Technical Uncertainty
The proposed implementation has significant gaps and unvalidated assumptions. Technical validation spikes are **REQUIRED** before committing to this approach.
:::

### 5.1 Authentication Detection Reliability (CRITICAL)

**Gap:** Assumes `authProvider._account` reliably indicates logout state - **UNVALIDATED**

**Risks:**
- Teams internal structure may not be available when expected
- Property paths could change with Teams updates
- Different logout scenarios may manifest differently
- False positives during app startup or network issues

**Impact:** If detection doesn't work reliably, entire feature fails

**Mitigation:** Complete Spike 1 & 2 (see Section 6)

### 5.2 Alternative Detection Methods Not Explored

**Gap:** Single detection method (React internals) with no fallback

**Missing Alternatives:**

1. **URL-Based Detection:**
```javascript
// Login page has distinctive URL patterns
const isLoginPage = window.location.href.includes('/login') ||
                    window.location.href.includes('/auth') ||
                    window.location.pathname === '/';
```

**Pros:** More stable, immediate availability
**Cons:** May not catch session expiry on loaded page

2. **localStorage Token Detection:**
```javascript
// Check for presence of authentication tokens
const hasAuthTokens = () => {
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.includes('refresh_token') || key?.includes('msal.token')) {
      return true;
    }
  }
  return false;
};
```

**Pros:** Uses existing TokenCache patterns
**Cons:** Tokens might persist temporarily after logout

3. **DOM-Based Detection:**
```javascript
// Check for login page elements vs authenticated UI
const hasLoginUI = !!document.querySelector('[data-testid="signin-button"]');
const hasAuthUI = !!document.querySelector('[data-testid="app-bar"]');
```

**Pros:** Visual state matches user experience
**Cons:** DOM structure can change

**Recommendation:** Use **multi-signal approach** combining multiple methods with confidence scoring

### 5.3 Timing and False Positives (HIGH RISK)

**Gap:** No strategy to avoid false "logged out" detection during app startup

**Problem Scenario:**
```
1. App starts → DOMContentLoaded fires
2. Modules initialize (including ReactHandler)
3. Auth monitoring starts immediately
4. Teams not yet loaded → appears "logged out"
5. False notification sent to user ❌
```

**Impact:** Users get spurious logout notifications on every app start

**Mitigation:** Implement smart timing:
- Wait for Teams fully loaded before monitoring
- Debounce state changes (3+ seconds)
- Require high confidence threshold
- Check multiple signals before deciding

### 5.4 Different Logout Scenarios Not Distinguished

**Gap:** All "not authenticated" states treated the same

**Scenarios:**

| Scenario | Should Notify? | Detection Challenge |
|----------|---------------|---------------------|
| Manual logout | ✅ Yes | Easy to detect |
| Session expired | ✅ Yes | May look like network issue |
| Network disconnected | ❌ No (temporary) | Hard to distinguish from real logout |
| Multi-device conflict | ✅ Yes (user's case!) | Looks like session expiry |
| App starting up | ❌ No (false positive) | Requires smart timing |
| Login page visible | ⚠️ Maybe | Could be re-auth flow |

**Mitigation:**
- Confidence scoring based on multiple signals
- Debouncing to wait for stable state
- Check network connectivity before notifying

### 5.5 Performance Impact Not Analyzed

**Gap:** No measurement of overhead from monitoring

**Concerns:**
- Auth state check every 30 seconds
- Re-rendering tray icon on every check?
- Accessing React internals - does it trigger re-renders?
- Canvas rendering overhead

**Mitigation:** Complete Spike 5 to measure actual impact

### 5.6 Edge Cases Not Covered

1. **Tray icon disabled:** Should auth monitoring still run?
2. **Custom icon path:** Does overlay work with custom icons?
3. **Multiple windows:** Duplicate monitoring/notifications?
4. **SSO/SAML flows:** Different authentication patterns?
5. **React internals change:** Teams update breaks detection?

---

## 6. Required Technical Validation Spikes

:::danger Blocking Validation Required
Do **NOT** proceed with implementation until Phase 1 spikes complete successfully. Results may require complete redesign of approach.
:::

### Phase 1: Core Validation (CRITICAL - Must Complete First)

#### Spike 1: Verify ReactHandler Access to authenticationService ⚠️ **BLOCKER**

**Duration:** 2-4 hours
**Priority:** CRITICAL

**Objective:** Confirm we can reliably access Teams authentication service

**Tasks:**
1. Add logging to inspect available structure:
```javascript
const teams2CoreServices = this._getTeams2CoreServices();
console.log('[SPIKE] teams2CoreServices:', teams2CoreServices);
console.log('[SPIKE] authService:', teams2CoreServices?.authenticationService);
console.log('[SPIKE] authProvider:', teams2CoreServices?.authenticationService?._coreAuthService?._authProvider);
console.log('[SPIKE] account:', teams2CoreServices?.authenticationService?._coreAuthService?._authProvider?._account);
```

2. Test in different states:
   - On login page (not authenticated)
   - After successful login
   - After manual logout
   - During app loading

3. Document actual structure and timing

**Success Criteria:**
- ✅ Can access authenticationService consistently
- ✅ Can differentiate logged-in vs logged-out
- ✅ Structure available within 30 seconds of app load

**Failure Plan:**
- If unavailable → Explore URL-based detection
- If unreliable → Implement multi-signal approach
- If too unstable → Consider localStorage token method

#### Spike 2: Test Multiple Logout Scenarios ⚠️ **BLOCKER**

**Duration:** 3-4 hours
**Priority:** CRITICAL

**Objective:** Understand how different logout scenarios manifest

**Tasks:**
1. Set up comprehensive logging:
```javascript
console.log('[SPIKE] Auth State:', {
  url: window.location.href,
  hasAccount: !!authProvider?._account,
  hasTokens: hasAuthTokens(),
  loginPageVisible: !!document.querySelector('[data-testid="signin-button"]'),
  teamsUIVisible: !!document.querySelector('[data-testid="app-bar"]'),
  timestamp: Date.now()
});
```

2. Test scenarios:
   - ✅ Manual logout (click logout)
   - ✅ Session expiry (leave open overnight)
   - ✅ Network disconnect (disable network)
   - ✅ Multi-device conflict (login on another device)
   - ✅ App restart
   - ✅ Cold start vs warm start

3. Document observable differences

4. Identify which should trigger notifications

**Success Criteria:**
- ✅ Can distinguish real logout from network issues
- ✅ Can detect multi-device conflict (user's scenario)
- ✅ Can avoid false positives during startup

**Failure Plan:**
- If indistinguishable → Use multiple signals + time delays
- If too many false positives → Increase debounce/threshold
- If unreliable → Add manual test mode for debugging

#### Spike 3: Verify Timing of Teams Internals ⚠️ **HIGH**

**Duration:** 2-3 hours
**Priority:** HIGH

**Objective:** Determine when authentication checking can safely begin

**Tasks:**
1. Add timestamp logging:
```javascript
console.log('[TIMING] DOMContentLoaded:', Date.now());
console.log('[TIMING] ReactHandler.init:', Date.now());
console.log('[TIMING] teams2CoreServices available:', Date.now());
console.log('[TIMING] authService available:', Date.now());
```

2. Test scenarios:
   - Cold start (first launch)
   - Warm start (already logged in)
   - Slow network connection
   - After force quit

3. Measure variability

**Success Criteria:**
- ✅ Know exact timing of when auth checking can start
- ✅ Understand timing variation across scenarios
- ✅ Have strategy to avoid startup false positives

**Failure Plan:**
- If too variable → Progressive checking with exponential backoff
- If too slow → Add loading state indicator
- If unreliable → Don't start monitoring until user interaction

**Phase 1 Decision Point:** If ANY spike fails, STOP and redesign approach

### Phase 2: Implementation Validation (Before Full Implementation)

#### Spike 4: Test Custom Event Propagation

**Duration:** 1-2 hours
**Priority:** HIGH

**Objective:** Verify events work between modules

**Tasks:**
1. Dispatch test event from ReactHandler
2. Listen in TrayIconRenderer
3. Verify timing and data integrity

**Success Criteria:**
- ✅ Events propagate reliably
- ✅ No race conditions
- ✅ Correct data received

#### Spike 5: Test Canvas Overlay Rendering

**Duration:** 2-3 hours
**Priority:** MEDIUM-HIGH

**Objective:** Verify visual indicators render correctly

**Tasks:**
1. Implement test overlays (slash, X, triangle)
2. Test on available desktop environments (GNOME, KDE, XFCE)
3. Test with all icon types
4. Measure performance impact

**Success Criteria:**
- ✅ Visible on all environments
- ✅ Good contrast on light/dark themes
- ✅ No significant performance impact

### Phase 3: Fallback Options (Parallel with Implementation)

#### Spike 6: URL-Based Detection

**Duration:** 1-2 hours
**Priority:** MEDIUM

**Objective:** Validate URL patterns as fallback

#### Spike 7: localStorage Token Patterns

**Duration:** 1-2 hours
**Priority:** MEDIUM

**Objective:** Validate token presence as auth indicator

---

## 7. Recommended Implementation Strategy

### Multi-Signal Detection Approach

Don't rely on single method - combine signals with confidence scoring:

```javascript
getAuthenticationState() {
  const signals = {
    reactInternals: this._checkReactInternals(),      // Weight: 40%
    urlPattern: this._checkUrlPattern(),               // Weight: 30%
    tokenPresence: this._checkTokenPresence(),         // Weight: 20%
    domState: this._checkDomState()                    // Weight: 10%
  };

  const confidence = this._calculateConfidence(signals);
  const authenticated = confidence.score > 0.6;

  return {
    authenticated,
    confidence: confidence.score,
    signals,
    timestamp: Date.now()
  };
}

_calculateConfidence(signals) {
  let score = 0;

  if (signals.reactInternals.authenticated) score += 0.4;
  if (signals.urlPattern.authenticated) score += 0.3;
  if (signals.tokenPresence.authenticated) score += 0.2;
  if (signals.domState.authenticated) score += 0.1;

  return { score, details: signals };
}

_checkReactInternals() {
  try {
    const authProvider = this._getAuthProvider();
    const authenticated = !!authProvider?._account;
    return { authenticated, available: true, method: 'react' };
  } catch {
    return { authenticated: false, available: false, method: 'react' };
  }
}

_checkUrlPattern() {
  const url = window.location.href;
  const isLoginPage = url.includes('/login') || url.includes('/auth');
  return {
    authenticated: !isLoginPage,
    available: true,
    method: 'url',
    url: window.location.pathname
  };
}

_checkTokenPresence() {
  try {
    const TokenCache = require('./tokenCache');
    const stats = TokenCache.getCacheStats();
    const hasTokens = stats.refreshTokenCount > 0 || stats.msalTokenCount > 0;
    return {
      authenticated: hasTokens,
      available: true,
      method: 'tokens',
      tokenCount: stats.totalKeys
    };
  } catch {
    return { authenticated: false, available: false, method: 'tokens' };
  }
}

_checkDomState() {
  const hasLoginUI = !!document.querySelector('[data-testid="signin-button"]');
  const hasAppBar = !!document.querySelector('[data-testid="app-bar"]');
  return {
    authenticated: hasAppBar && !hasLoginUI,
    available: true,
    method: 'dom',
    hasLoginUI,
    hasAppBar
  };
}
```

### Smart Timing with Debouncing

```javascript
startAuthenticationMonitoring() {
  // Phase 1: Wait for Teams to load
  this._waitForTeamsReady().then(() => {
    console.debug('[AUTH] Teams ready, establishing baseline');

    // Phase 2: Establish stable baseline (wait 10 seconds)
    setTimeout(() => {
      this._establishBaseline();

      // Phase 3: Start periodic monitoring
      this._beginPeriodicMonitoring();
    }, 10000);
  });
}

_beginPeriodicMonitoring() {
  let lastState = this.baselineState;

  const check = () => {
    const currentState = this.getAuthenticationState();

    if (currentState.authenticated !== lastState.authenticated) {
      console.debug('[AUTH] State change detected, confidence:', currentState.confidence);

      // Debounce: confirm still changed after delay
      if (this._debounceTimer) {
        clearTimeout(this._debounceTimer);
      }

      this._debounceTimer = setTimeout(() => {
        const verifiedState = this.getAuthenticationState();

        // Only act if still changed AND high confidence
        if (verifiedState.authenticated === currentState.authenticated &&
            verifiedState.confidence > this.config.logoutDetectionConfidenceThreshold) {
          this._handleStateChange(verifiedState, lastState);
          lastState = verifiedState;
        } else {
          console.debug('[AUTH] State change not confirmed or low confidence');
        }
      }, this.config.logoutDetectionDebounceMs || 3000);
    }
  };

  setInterval(check, 30000); // Check every 30 seconds
  check(); // Initial check
}
```

### Extensive Logging and Debug Mode

```javascript
// Only log in debug mode
if (this.config.debugAuthDetection) {
  console.log('[AUTH_DEBUG]', {
    timestamp: new Date().toISOString(),
    authenticated: this.isAuthenticated,
    confidence: this.lastConfidence,
    signals: this.lastSignals,
    url: window.location.href,
    timeSinceInit: Date.now() - this.initTimestamp
  });
}
```

---

## 8. Testing Strategy

### 8.1 Unit Testing

Not feasible for this feature - requires live Teams environment and authentication

### 8.2 Manual Testing Checklist

**Authentication Detection:**
- [ ] Verify detection on login page
- [ ] Verify detection after successful login
- [ ] Verify detection after manual logout
- [ ] Verify detection after session expiry
- [ ] Verify no false positive on app startup
- [ ] Verify no false positive on network disconnect
- [ ] Verify detection of multi-device logout

**Visual Indicator:**
- [ ] Test on GNOME desktop environment
- [ ] Test on KDE Plasma desktop environment
- [ ] Test on XFCE desktop environment
- [ ] Test with default icon
- [ ] Test with dark monochrome icon
- [ ] Test with light monochrome icon
- [ ] Test with custom icon path
- [ ] Test visibility on light system theme
- [ ] Test visibility on dark system theme
- [ ] Verify overlay appears when logged out
- [ ] Verify overlay disappears when logged in
- [ ] Test all indicator styles (slash, X, triangle, dim)

**Notification:**
- [ ] Verify notification sent on logout
- [ ] Verify notification not sent on startup
- [ ] Verify notification not sent on network disconnect
- [ ] Verify notification can be disabled via config
- [ ] Test notification click behavior

**Performance:**
- [ ] Monitor CPU usage during monitoring
- [ ] Monitor memory usage over time
- [ ] Verify no impact on app startup time
- [ ] Verify no lag in icon updates

**Configuration:**
- [ ] Test with visual indicator enabled
- [ ] Test with visual indicator disabled
- [ ] Test with notification enabled
- [ ] Test with notification disabled
- [ ] Test different indicator styles
- [ ] Test different confidence thresholds
- [ ] Test different debounce times
- [ ] Test debug mode logging

### 8.3 Regression Testing

- [ ] Verify existing tray functionality (unread badges) still works
- [ ] Verify tray icon still updates on new messages
- [ ] Verify tray click still focuses window
- [ ] Verify tray tooltip still shows unread count
- [ ] Verify custom notification system still works

---

## 9. Risk Assessment & Mitigation

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| **Auth detection fails entirely** | MEDIUM | CRITICAL | Phase 1 spikes validate before implementation |
| **False positives on startup** | HIGH | HIGH | Smart timing + debouncing + confidence threshold |
| **React internals change** | MEDIUM | HIGH | Multi-signal approach + fallback methods |
| **Performance degradation** | LOW | MEDIUM | Spike 5 measures impact, optimize if needed |
| **Visual indicator not visible** | LOW | MEDIUM | Test on multiple DEs, provide style options |
| **Notification spam** | MEDIUM | HIGH | Debouncing + confidence + config to disable |
| **Edge case failures** | MEDIUM | MEDIUM | Comprehensive testing, config flags to disable |
| **Maintenance burden** | LOW | MEDIUM | Good documentation, debug mode for troubleshooting |

### Overall Risk Level

**MEDIUM-HIGH** - Feature has technical uncertainty but is well-researched with clear validation path

**Recommendation:** Proceed with Phase 1 spikes to validate feasibility before committing to full implementation

---

## 10. Effort Estimate

| Phase | Description | Hours |
|-------|-------------|-------|
| **Phase 1: Validation Spikes** | Critical technical validation | **12-18** |
| - Spike 1 | ReactHandler auth access | 2-4 |
| - Spike 2 | Multiple logout scenarios | 3-4 |
| - Spike 3 | Timing verification | 2-3 |
| - Phase 1 decision | Evaluate results, redesign if needed | 2-4 |
| - Spike 4 | Event propagation | 1-2 |
| - Spike 5 | Canvas rendering | 2-3 |
| **Phase 2: Implementation** | Core feature development | **16-24** |
| - IPC prerequisite fix | ReactHandler + preload changes | 2-3 |
| - Auth state detection | Multi-signal implementation | 4-6 |
| - Auth monitoring | Smart timing + debouncing | 3-4 |
| - Visual indicator | Canvas overlay rendering | 3-4 |
| - Notification | Logout notification logic | 2-3 |
| - Configuration | Config schema + defaults | 2-3 |
| **Phase 3: Testing & Refinement** | Quality assurance | **8-12** |
| - Manual testing | All scenarios + environments | 4-6 |
| - Bug fixes | Issues found during testing | 2-4 |
| - Performance optimization | If needed based on Spike 5 | 1-2 |
| - Documentation | User guide + config reference | 1-2 |
| **Phase 4: Fallback Options** | Robustness improvements (optional) | **4-6** |
| - Spike 6 | URL-based detection | 1-2 |
| - Spike 7 | Token-based detection | 1-2 |
| - Integration | Add to multi-signal system | 2-3 |
| **TOTAL** | | **38-60** |

### Original vs Realistic Estimate

| Estimate | Hours | Notes |
|----------|-------|-------|
| **Original** (investigation only) | 16-24 | Assumed detection works, no validation |
| **Realistic** (with validation) | **38-60** | Includes spikes, multi-signal, testing |

### Assumptions

- Assumes Phase 1 spikes succeed (no major redesign needed)
- Assumes one developer working part-time
- Includes buffer for unforeseen issues
- Does not include code review or PR feedback cycles

---

## 11. Decision Recommendation

### Proceed with Caution

✅ **RECOMMEND: Proceed with Phase 1 spikes**

The feature is well-researched and has clear user value, but **high technical uncertainty** requires validation before full commitment.

### Next Steps

1. **Discuss with maintainer** - Confirm feature is desired and effort is acceptable
2. **Complete Phase 1 spikes** (12-18 hours) - Validate core assumptions
3. **Evaluate spike results:**
   - ✅ If successful → Proceed with implementation
   - ⚠️ If partial → Adjust approach based on findings
   - ❌ If failed → Consider alternative feature or abandon

4. **If proceeding:** Complete Phase 2 spikes, then implement
5. **Regular check-ins:** Review progress and adjust plan as needed

### Alternative: Lightweight Approach

If full implementation is too risky/expensive, consider simplified version:

**Notification-Only Implementation (8-12 hours):**
- Skip visual indicator (reduces complexity)
- Use simpler detection (URL-based only)
- No multi-signal or confidence scoring
- Accept higher false positive rate
- Make opt-in (disabled by default)

**Pros:** Much faster, lower risk
**Cons:** Less robust, may annoy some users

---

## 12. Related Documentation

- **GitHub Issue:** [#1987 - Change tray icon color if logged out](https://github.com/IsmaelMartinez/teams-for-linux/issues/1987)
- **Related Issues:**
  - [#1357](https://github.com/IsmaelMartinez/teams-for-linux/issues/1357) - Authentication refresh failures (token cache)
  - [#1902](https://github.com/IsmaelMartinez/teams-for-linux/issues/1902) - TrayIconRenderer IPC initialization
  - [#1795](https://github.com/IsmaelMartinez/teams-for-linux/issues/1795) - Tray icon timing issues
- **Architecture Documentation:**
  - [Module Index](../module-index.md)
  - [Token Cache Architecture](../token-cache-architecture.md)
  - [Security Architecture](../security-architecture.md)
- **Configuration:**
  - [Configuration Reference](../../configuration.md)

---

## 13. Appendix: Code Locations

### Files to Modify

| File | Purpose | Changes Required |
|------|---------|------------------|
| `app/browser/tools/reactHandler.js` | Authentication detection | Add auth monitoring methods |
| `app/browser/tools/trayIconRenderer.js` | Visual indicator | Add overlay rendering |
| `app/browser/preload.js` | IPC access | Pass ipcRenderer to ReactHandler |
| `app/browser/tools/activityHub.js` | Monitoring lifecycle | Call new auth monitoring |
| `app/config/index.js` | Configuration | Add new config options |

### New Files Required

None - all changes are modifications to existing files

### Dependencies

- No new npm packages required
- Uses existing Electron, Node.js, and browser APIs
- Leverages existing IPC infrastructure

---

## Document History

- **2025-11-26:** Initial research document created from investigation report and gaps analysis
- **2025-11-26:** Added comprehensive spike definitions and multi-signal detection strategy
- **2025-11-26:** Merged into Docusaurus documentation site

---

:::info Next Action
Complete **Phase 1 technical validation spikes** before proceeding with implementation. Results will determine if approach is viable or requires redesign.
:::
