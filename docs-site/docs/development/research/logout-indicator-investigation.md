# Tray Icon Logout Indicator - Research & Implementation Plan

**Status:** Spikes Implemented - Ready for Validation
**Date:** November 2025
**Updated:** December 2025
**Issue:** [#1987 - Change tray icon color if logged out](https://github.com/IsmaelMartinez/teams-for-linux/issues/1987)
**Author:** Claude AI Assistant
**Priority:** Enhancement - User Experience Improvement

:::info Spike Implementation Available
All validation spikes have been implemented in `app/browser/tools/authSpikes.js`. To run them:

1. Launch the app
2. Open DevTools console (Ctrl+Shift+I)
3. Run: `window.teamsForLinuxAuthSpikes.runAllSpikes()`
4. Review results in console

For ongoing monitoring: `window.teamsForLinuxAuthSpikes.startMonitoring(5000, 60000)`
:::

---

## Executive Summary

User requests a visual indicator in the tray icon when logged out of Teams, specifically to detect multi-device logout conflicts without having to open the application.

:::danger Critical Validation Required
This feature depends on **unvalidated assumptions** about Teams internal structure. **Do not implement anything** until core validation spikes prove the approach works. This prevents building throwaway code.
:::

### Key Findings

- ✅ **Architecture exists:** Tray icon rendering system is in place
- ⚠️ **UNVALIDATED:** Can we reliably detect logout state from Teams internals?
- ⚠️ **UNVALIDATED:** Will detection work across different logout scenarios?
- ⚠️ **UNVALIDATED:** Can we avoid false positives during app startup?

### Proposed Solution (If Spikes Succeed)

**Simple combined approach:**
- Visual overlay on tray icon when logged out (red slash)
- OS notification on logout detection
- Both individually configurable

### Validation-First Strategy

```
Phase 1: VALIDATE (4-6 hours)
├─ Spike 1: Prove we can detect logout → GO/NO-GO decision
├─ Spike 2: Prove we can avoid false positives → Adjust approach if needed
└─ Decision: Proceed to implementation OR stop

Phase 2: IMPLEMENT (only if spikes succeed) (8-12 hours)
├─ Add simple detection
├─ Add visual overlay
├─ Add notification
└─ Add configuration

Total: 12-18 hours (not 38-60 hours)
```

---

## 1. Problem Statement

User experiences frequent logouts when logged into Teams on multiple machines simultaneously. They need:

1. **Visual indicator** in tray icon showing logged-out state
2. **Persistent awareness** without opening the application
3. **Notification** when logout occurs

**Current state:** Tray icon looks identical whether logged in or logged out.

---

## 2. Core Technical Question

:::warning THE Critical Question
Can we reliably detect when the user is logged out of Teams by inspecting the web application's internal state?
:::

**Hypothesis:** Teams stores authentication state in its React component tree at `teams2CoreServices.authenticationService._authProvider._account`

**Validation needed:**
- Does this property exist and is it accessible?
- Is `_account` null when logged out and populated when logged in?
- Is the structure stable enough to rely on?

**Alternative if hypothesis fails:**
- URL-based detection (login page vs app)
- localStorage token presence checking
- **OR** abandon feature

---

## 3. Current Architecture (Relevant Pieces Only)

### Tray Icon System

**TrayIconRenderer** (`app/browser/tools/trayIconRenderer.js`)
- Renders tray icons with notification badges
- Already listens to events and re-renders icons
- Can easily add logout overlay to existing rendering

**Flow:**
```
Event → TrayIconRenderer.render() → Canvas manipulation → IPC to main → Tray updated
```

**What we'd add:** Listen to `auth-state-changed` event, add overlay if logged out

### Authentication Access

**ReactHandler** (`app/browser/tools/reactHandler.js`)
- Can access Teams React internals via `_getTeams2CoreServices()`
- Has methods to navigate to authentication service
- **Missing:** Method to check if logged in/out
- **Missing:** `ipcRenderer` access (needed for notifications)

**What we'd add:** Method to check `authProvider._account` and dispatch events

---

## 4. Critical Validation Spikes

:::danger Stop and Validate First
Do NOT write implementation code until these spikes prove the approach works. Each spike should be 1-2 hours of throwaway code to test assumptions.
:::

### Spike 1: Can We Detect Logout? ⚠️ **BLOCKER**

**Duration:** 2-3 hours
**Goal:** Prove we can distinguish logged-in from logged-out state

**What to do:**
1. Add temporary logging to ReactHandler:
```javascript
// In reactHandler.js, add to an existing method or create test method
testAuthDetection() {
  console.log('=== AUTH DETECTION TEST ===');
  const cores = this._getTeams2CoreServices();
  console.log('Has coreServices:', !!cores);
  console.log('Has authService:', !!cores?.authenticationService);
  console.log('Has authProvider:', !!cores?.authenticationService?._coreAuthService?._authProvider);

  const authProvider = cores?.authenticationService?._coreAuthService?._authProvider;
  console.log('Account:', authProvider?._account);
  console.log('Is logged in?:', !!authProvider?._account);
}
```

2. Test in these scenarios:
   - ✅ On login page (should show logged out)
   - ✅ After successful login (should show logged in)
   - ✅ After manual logout (should show logged out)
   - ✅ After letting session expire overnight (should show logged out)

3. Document the results:
   - Does `_account` reliably indicate login state?
   - What does the account object contain when logged in?
   - Is it null/undefined when logged out?

**Success Criteria:**
- `_account` is consistently null/undefined when logged out
- `_account` is consistently populated when logged in
- Property is accessible without errors

**Failure Plan:**
- If property doesn't exist → Try URL-based detection spike
- If inconsistent → Document patterns, try alternative properties
- If completely unreliable → **STOP, feature not feasible**

**Decision Point:** Only proceed to Spike 2 if this succeeds

### Spike 2: Can We Avoid False Positives? ⚠️ **CRITICAL**

**Duration:** 1-2 hours
**Goal:** Ensure we don't incorrectly report "logged out" during app startup

**What to do:**
1. Add timing logging:
```javascript
// Track when things become available
console.log('[TIMING] DOMContentLoaded:', Date.now());

// In testAuthDetection, add:
console.log('[TIMING] Auth check at:', Date.now());
console.log('[TIMING] URL:', window.location.href);
```

2. Test scenarios:
   - Cold start (first app launch)
   - Warm start (app already logged in)
   - Page refresh
   - Network reconnect after disconnect

3. Answer questions:
   - When does `_account` become available after app start?
   - Is there a period where it's temporarily null during loading?
   - How can we distinguish "loading" from "logged out"?

**Success Criteria:**
- Can identify when Teams is "still loading" vs actually logged out
- Have strategy to wait until Teams is ready before checking

**Simple Mitigation Ideas:**
- Wait 10 seconds after app start before checking
- Check URL: if on login page → logged out, if on `/` with no account → still loading
- Combine: Only report logged out if `!_account AND URL includes 'login'`

**Decision Point:** If we can't avoid false positives reliably, feature will annoy users on every startup → **STOP**

### Spike 3: Test Multi-Device Logout (Optional but Recommended)

**Duration:** 1 hour
**Goal:** Confirm we can detect the user's specific scenario

**What to do:**
1. Log into Teams on the test machine
2. Log into Teams on another device with same account
3. Watch the console logs on test machine
4. Verify auth state changes when kicked out

**Success Criteria:**
- Detection works for multi-device logout scenario

---

## 5. Simplified Implementation (Only If Spikes Succeed)

### Approach: Start Simple, Add Complexity Only If Needed

:::info Simple First
Don't implement multi-signal detection, confidence scoring, or complex debouncing upfront. Start with the simplest thing that works based on spike results.
:::

### Step 1: Add Auth Detection to ReactHandler

**Prerequisite:** Add `ipcRenderer` to ReactHandler initialization (see section 6)

```javascript
// In reactHandler.js
getAuthenticationState() {
  if (!this._validateTeamsEnvironment()) {
    return { authenticated: false, reason: 'not_ready' };
  }

  try {
    const authProvider = this._getTeams2CoreServices()
      ?.authenticationService
      ?._coreAuthService
      ?._authProvider;

    const account = authProvider?._account;
    return {
      authenticated: !!account,
      accountId: account?.id
    };
  } catch (error) {
    console.error('[AUTH] Detection error:', error);
    return { authenticated: false, reason: 'error' };
  }
}

startAuthenticationMonitoring() {
  // Based on Spike 2 results, wait for Teams to load
  // Simple approach: wait 15 seconds after init
  setTimeout(() => {
    let lastState = this.getAuthenticationState();

    setInterval(() => {
      const currentState = this.getAuthenticationState();

      if (currentState.authenticated !== lastState.authenticated) {
        console.log('[AUTH] State changed:', currentState);

        // Send notification if logged out
        if (!currentState.authenticated && this.config?.notifyOnLogout) {
          this._sendLogoutNotification();
        }

        // Dispatch event for tray icon
        globalThis.dispatchEvent(new CustomEvent('auth-state-changed', {
          detail: currentState
        }));

        lastState = currentState;
      }
    }, 30000); // Check every 30 seconds
  }, 15000); // Wait 15 seconds for Teams to load
}

_sendLogoutNotification() {
  if (!this.ipcRenderer) return;

  this.ipcRenderer.invoke('show-notification', {
    title: 'Teams for Linux - Logged Out',
    body: 'You have been logged out of Microsoft Teams.',
    urgency: 'normal'
  }).catch(err => console.error('[AUTH] Notification failed:', err));
}
```

### Step 2: Add Visual Overlay to TrayIconRenderer

```javascript
// In trayIconRenderer.js
init(config, ipcRenderer) {
  this.ipcRenderer = ipcRenderer;
  this.config = config;
  this.isAuthenticated = true; // Assume logged in initially

  // ... existing init code ...

  // Listen for auth state changes
  globalThis.addEventListener('auth-state-changed', (event) => {
    this.isAuthenticated = event.detail?.authenticated ?? true;
    // Re-render with current count
    this.updateActivityCount({ detail: { number: this.lastActivityCount || 0 }});
  });
}

_addRedCircleNotification(canvas, image, newActivityCount, resolve) {
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0, 140, 140);

  // Add logout indicator if feature enabled and not authenticated
  if (!this.isAuthenticated && this.config?.trayIconShowLogoutIndicator !== false) {
    // Simple red diagonal slash
    ctx.strokeStyle = "#ff0000";
    ctx.lineWidth = 8;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(20, 20);
    ctx.lineTo(120, 120);
    ctx.stroke();
  }

  // Add notification badge (existing code)
  if (newActivityCount > 0) {
    // ... existing badge code ...
  }

  const resizedCanvas = this._getResizeCanvasWithOriginalIconSize(canvas);
  resolve(resizedCanvas.toDataURL());
}
```

### Step 3: Add Configuration

```javascript
// In config schema
{
  // Show visual indicator on tray icon when logged out
  "trayIconShowLogoutIndicator": true,

  // Send notification when logout detected
  "notifyOnLogout": true
}
```

### Step 4: Fix IPC Prerequisite

Add ReactHandler to preload.js modules list (see section 6 for details)

---

## 6. IPC Prerequisite Fix

:::danger Required Before Implementation
ReactHandler needs `ipcRenderer` to send notifications but currently doesn't receive it.
:::

**Change 1:** Update ReactHandler init signature
```javascript
// In app/browser/tools/reactHandler.js
init(config, ipcRenderer) {
  this.config = config;
  this.ipcRenderer = ipcRenderer;
  console.debug('[ReactHandler] Initialized');
}
```

**Change 2:** Add to preload.js modules array
```javascript
// In app/browser/preload.js
const modules = [
  // ... existing modules ...
  { name: "reactHandler", path: "./tools/reactHandler" }
];

// Update conditional
if (module.name === "settings" ||
    module.name === "theme" ||
    module.name === "trayIconRenderer" ||
    module.name === "mqttStatusMonitor" ||
    module.name === "reactHandler") {  // Add this
  moduleInstance.init(config, ipcRenderer);
}
```

---

## 7. Effort Estimate (Validation-First)

| Phase | Hours | Stop Condition |
|-------|-------|----------------|
| **Spike 1: Detection** | 2-3 | If detection doesn't work reliably |
| **Spike 2: False positives** | 1-2 | If can't avoid false positives |
| **Spike 3: Multi-device** | 1 | N/A (optional) |
| **DECISION POINT** | - | **STOP if spikes fail** |
| **Implementation** | 8-12 | Only if spikes succeed |
| **Testing** | 2-4 | N/A |
| **TOTAL** | **14-22 hours** | Much better than 38-60! |

### Comparison

| Approach | Hours | Risk |
|----------|-------|------|
| **Original (over-engineered)** | 38-60 | Build half-feature before knowing if it works |
| **Simplified (validation-first)** | 14-22 | Validate first, implement only if proven |

---

## 8. Decision Tree

```
START
  ↓
Spike 1: Can detect logout?
  ↓
  ├─ NO → Try URL-based spike → If fails → STOP (feature not feasible)
  ↓
  └─ YES → Continue
       ↓
Spike 2: Can avoid false positives?
  ↓
  ├─ NO → STOP (will annoy users)
  ↓
  └─ YES → GO (implement simple version)
       ↓
Implementation (8-12 hours)
  ↓
Testing (2-4 hours)
  ↓
DONE
```

**Key Decision Points:**
1. After Spike 1: Does detection work? (If no → STOP or try alternative)
2. After Spike 2: Can we avoid false positives? (If no → STOP)
3. Only implement if both spikes succeed

---

## 9. What We're NOT Doing (Simplifications)

To avoid over-engineering, we're explicitly NOT doing:

❌ **Multi-signal detection** - Start with React internals only, add alternatives later if needed
❌ **Confidence scoring** - Binary logged-in/logged-out, no percentages
❌ **Complex debouncing** - Simple 30-second polling with 15-second startup delay
❌ **Multiple visual styles** - Just red slash, add options later if requested
❌ **Extensive logging modes** - Basic console.log, add debug mode later if needed
❌ **Edge case handling** - Handle common cases first, add complexity only if problems arise

**Philosophy:** Validate → Implement minimum → Test → Add features if needed

---

## 10. Testing Strategy

### Manual Testing Checklist

**After Spike 1 & 2:**
- [ ] Detects logged-in state correctly
- [ ] Detects logged-out state after manual logout
- [ ] Detects logged-out state after session expiry
- [ ] No false positive on cold start
- [ ] No false positive on warm start

**After Implementation:**
- [ ] Visual overlay appears when logged out
- [ ] Visual overlay disappears when logged in
- [ ] Notification sent on logout (if enabled)
- [ ] No notification on app startup
- [ ] Configuration options work
- [ ] Existing tray features still work (unread badges)

---

## 11. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Detection doesn't work | CRITICAL - Feature impossible | Spike 1 validates before any implementation |
| False positives on startup | HIGH - Annoys users | Spike 2 validates, simple timing delay |
| Teams structure changes | HIGH - Feature breaks | Document fragility, monitor for breakage |
| Performance impact | LOW - Check every 30s | Test on slow machines |

**Overall Risk:** MEDIUM - Spikes reduce risk significantly by validating before implementation

---

## 12. Next Steps

:::info Immediate Next Action
Complete Spike 1 (2-3 hours) to validate core assumption. Do NOT proceed with any other work until spike proves detection works.
:::

**Sequence:**
1. **Complete Spike 1** → Determines if feature is feasible
2. **Review spike results** → Decide go/no-go
3. **If GO: Complete Spike 2** → Ensures we can avoid false positives
4. **If GO: Implement** → Simple version per section 5
5. **Test** → Manual testing per section 10
6. **Ship** → Monitor for issues, add complexity only if needed

**Do not:**
- Implement multi-signal detection until simple version proves insufficient
- Add configuration complexity until basic version works
- Optimize performance until there's a measurable problem
- Handle edge cases until they actually occur

---

## 13. Related Documentation

- **Issue:** [#1987 - Change tray icon color if logged out](https://github.com/IsmaelMartinez/teams-for-linux/issues/1987)
- **Related Architecture:**
  - [Module Index](../module-index.md)
  - [Token Cache Architecture](../token-cache-architecture.md) - Related auth work
- **Related Issues:**
  - [#1357](https://github.com/IsmaelMartinez/teams-for-linux/issues/1357) - Token cache (auth)
  - [#1902](https://github.com/IsmaelMartinez/teams-for-linux/issues/1902) - Tray IPC

---

## Document History

- **2025-11-26:** Simplified from over-engineered 38-60 hour plan to validation-first 14-22 hour plan
- **2025-11-26:** Removed multi-signal detection, confidence scoring, complex timing
- **2025-11-26:** Focused on 2-3 critical spikes to validate before any implementation
- **2025-11-26:** Added clear decision tree and stop conditions

---

:::danger Remember
The goal is to validate the approach works with **2-3 hours of throwaway spike code**, NOT to build half the feature before discovering it won't work. Do the spikes first!
:::

---

## Spike Implementation Details

### Implementation Location

All spikes have been implemented in `app/browser/tools/authSpikes.js`.

### How to Run

```javascript
// From DevTools console:

// Run all spikes at once:
const results = window.teamsForLinuxAuthSpikes.runAllSpikes();

// Results include:
// - spike1_detection: Auth state detection via React internals
// - spike2_timing: False positive avoidance strategy
// - spike3_urlDetection: URL-based backup detection
// - overallResult: { status: 'GO'|'CONDITIONAL'|'BLOCKED', summary: '...' }

// Monitor auth state over time (check every 5s for 60s):
const monitor = window.teamsForLinuxAuthSpikes.startMonitoring(5000, 60000);
// Stop early: monitor.stop()
```

### Interpreting Results

| Spike | Success Criteria | Failure Action |
|-------|-----------------|----------------|
| `spike1_detection` | `authProviderFound: true` AND `isLoggedIn` is not null | Try URL-based detection only |
| `spike2_timing` | `authStateConsistent: true` | Increase startup delay |
| `spike3_urlDetection` | `canUseAsBackup: true` | Always true (URL patterns work) |

### Decision Tree

```
spike1_detection.authProviderFound?
├─ YES → Primary method works → GO
└─ NO → spike3_urlDetection.canUseAsBackup?
        ├─ YES → URL-only fallback → CONDITIONAL GO
        └─ NO → BLOCKED (unlikely)
```

### Next Steps After Validation

If spikes pass:
1. Add `getAuthenticationState()` method to ReactHandler
2. Add `startAuthenticationMonitoring()` with 15s startup delay
3. Update TrayIconRenderer to listen for `auth-state-changed` events
4. Add visual overlay when logged out
5. Add notification on logout detection

### Files Changed

- `app/browser/tools/authSpikes.js` - Spike implementation
- `app/browser/preload.js` - Added authSpikes to module list
