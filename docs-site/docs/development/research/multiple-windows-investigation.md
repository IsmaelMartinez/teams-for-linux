# Multiple Windows Feature Investigation

**Issue:** [#1984](https://github.com/IsmaelMartinez/teams-for-linux/issues/1984)
**Date:** 2025-11-25
**Status:** Investigation Complete

## Summary

This document investigates the feasibility of allowing multiple windows for a single account in Teams for Linux, similar to the native Windows Teams client's ability to pop out chats and meetings into separate windows.

## Issue Background

The user request seeks:

- Ability to open chats in separate windows (pop-out functionality)
- Ability to open meetings in separate windows
- Similar behavior to the native Windows Teams client
- Workaround for the limitation where activating a meeting minimizes chats

The user claims "The PWA previously had multi-window capability but it was disabled", however research indicates this may be a misunderstanding.

## Current Architecture

### Single Instance Lock

The application uses Electron's `requestSingleInstanceLock()` to prevent multiple instances:

```javascript
// app/index.js:61
const gotTheLock = app.requestSingleInstanceLock();
if (gotTheLock) {
  app.on("second-instance", mainAppWindow.onAppSecondInstance);
  // ...
}
```

When a second instance is launched, it:

1. Focuses the existing window (`mainAppWindow.onAppSecondInstance` in `app/mainAppWindow/index.js:299-314`)
2. Processes any URL arguments
3. Prevents the second instance from running

### Window Creation

The main application window is created via:

- `BrowserWindowManager` class (`app/mainAppWindow/browserWindowManager.js`)
- Creates a single `BrowserWindow` with specific webPreferences
- Returns this window to be stored in the module-level `window` variable

### Window Open Handler

The app intercepts window open requests via `setWindowOpenHandler`:

```javascript
// app/mainAppWindow/index.js:586
window.webContents.setWindowOpenHandler(onNewWindow);
```

The `onNewWindow` function (`app/mainAppWindow/index.js:530-553`):

- Denies meetup-join URLs (optionally loads them in the main window)
- Denies `about:blank` URLs (for authentication flows)
- Calls `secureOpenLink` for other URLs which either:
  - Opens in system browser (`action: 0`)
  - Allows as a modal child window with Ctrl+click (`action: 1`)
  - Denies the request (`action: "deny"`)

### IPC Communication Architecture

The application relies heavily on IPC communication between the renderer process (Teams web UI) and main process. Key channels include:

- **Tray Icon Updates:** `tray-update`, `set-badge-count` - aggregate unread counts
- **User Status:** `user-status-changed` - tracks user presence
- **Call State:** `call-connected`, `call-disconnected` - manages power save blocker
- **Screen Sharing:** `screen-sharing-started`, `screen-sharing-stopped` - tracks sharing state
- **Notifications:** `show-notification`, `play-notification-sound` - system notifications

All IPC channels are validated through `app/security/ipcValidator.js` allowlist.

### Browser Tools (Renderer Process)

Several tools run in each renderer process and interact with the Teams web UI:

- **activityHub.js:** Connects to Teams React internals for call/activity events
- **trayIconRenderer.js:** Listens to `unread-count` events and updates tray icon
- **reactHandler.js:** Provides access to Teams internal React state
- **mutationTitle.js:** Observes page title changes for notifications
- **tokenCache.js:** Manages authentication token caching

These tools are initialized via `app/browser/preload.js` and assume a single window context.

## Microsoft Teams PWA Capabilities

Research into Microsoft Teams PWA reveals:

- **The Teams PWA does NOT natively support multiple windows or pop-out chats**
- This is a known limitation of the PWA version compared to the native client
- Users have requested this feature in Microsoft community forums
- The "PWA previously had multi-window capability" claim appears to be incorrect

Sources:

- [Teams Progressive Web Apps (PWAs) - Microsoft Learn](https://learn.microsoft.com/en-us/microsoftteams/teams-progressive-web-apps)
- [Microsoft Teams progressive web app now available on Linux - Microsoft Community Hub](https://techcommunity.microsoft.com/t5/microsoft-teams-blog/microsoft-teams-progressive-web-app-now-available-on-linux/bc-p/3675594)

The native Windows Teams client has this capability, which may be the source of confusion.

## Technical Challenges

### 1. Single Instance Lock Removal

**Challenge:** The `requestSingleInstanceLock()` prevents multiple instances.

**Impact:**

- Would need to either remove the lock entirely or track multiple windows within a single process
- Deep linking and protocol handlers depend on the second-instance event
- Configuration expects a single userData directory

### 2. IPC Communication Model

**Challenge:** Current IPC architecture assumes single window communication.

**Examples:**

- Tray icon updates: Which window's unread count should be shown?
- User status: If user is "in call" in one window, how does that affect the other windows?
- Screen sharing state: Only one window can share at a time
- Notifications: Which window triggered the notification?

**Required Changes:**

- Add window tracking/identification to IPC messages
- Aggregate state across multiple windows (e.g., total unread count)
- Route window-specific responses back to the correct window
- Update all 72 allowed IPC channels to handle multi-window context

### 3. Browser Tools Multi-Window Support

**Challenge:** Browser tools assume single window context.

**Examples:**

- `trayIconRenderer`: Each window would send independent tray updates, causing conflicts
- `activityHub`: Multiple windows would create duplicate event listeners
- `reactHandler`: Token cache and authentication state shared or isolated?
- `mutationTitle`: Title changes from which window should be prioritized?

**Required Changes:**

- Refactor tools to coordinate across windows
- Implement state synchronization or window-specific state
- Update initialization logic in `app/browser/preload.js`

### 4. State Management Complexity

**Challenge:** Application state is scattered across modules.

**Examples:**

- Module-level variables like `window` in `app/mainAppWindow/index.js:38`
- Connection manager tracks single URL/connection
- Screen sharing service tracks single preview window
- Notification service assumes single window context

**Required Changes:**

- Centralize window management
- Create window registry/tracker
- Update all modules to support multiple windows
- Refactor from singleton pattern to multi-instance pattern

### 5. Teams Web Application Limitations

**Challenge:** The Teams web application itself may not support multiple windows.

**Observations:**

- Teams PWA does not natively provide multi-window capability
- The web UI may not have the necessary hooks or APIs to support pop-out functionality
- Microsoft has not enabled this feature in the PWA, suggesting architectural limitations

**Unknown:**

- Can Teams web UI function correctly when loaded in multiple windows simultaneously?
- Does Teams web use shared workers or service workers that expect single window?
- Are there session/authentication issues with multiple windows?

## Potential Implementation Approaches

### Approach 1: Allow Multiple Independent Windows

**Description:** Remove single instance lock and allow multiple fully independent windows.

**Pros:**

- Simplest implementation
- Each window is completely isolated
- No complex state synchronization

**Cons:**

- Each window would have its own tray icon
- No coordination between windows
- Higher memory usage (multiple Teams instances)
- May violate Teams session/authentication model
- Does not achieve the desired "pop-out" behavior

**Effort:** Medium

### Approach 2: Primary + Secondary Window Pattern

**Description:** Maintain one primary window and allow secondary windows with limited functionality.

**Design:**

- Primary window: Full Teams interface, manages tray icon, receives all IPC
- Secondary windows: Specific views (e.g., meeting or chat), minimal IPC

**Pros:**

- Clear ownership of global state (tray, notifications, status)
- Reduced complexity compared to full multi-window support
- Aligns with native client behavior (main window + pop-outs)

**Cons:**

- Still requires significant IPC refactoring
- Browser tools need window-type awareness
- Complex window lifecycle management
- Unknown if Teams web UI supports this model

**Effort:** High

### Approach 3: Single Window with Electron Browser Views

**Description:** Use Electron BrowserViews to create "virtual" windows within a single window.

**Design:**

- Single main BrowserWindow
- Multiple BrowserViews for different Teams content
- Custom UI to manage/arrange views

**Pros:**

- No IPC refactoring needed
- Single window context preserved
- Lower memory usage

**Cons:**

- Does not provide true separate windows (can't move to different monitors easily)
- Would require custom window management UI
- May not integrate well with window manager
- Does not match user expectation of separate windows

**Effort:** High (different implementation path)

### Approach 4: Wait for Teams PWA Feature

**Description:** Monitor Microsoft Teams PWA development for native multi-window support.

**Rationale:**

- The limitation is in the Teams web application itself
- Microsoft has not enabled this in the PWA
- Any workaround may break when Teams updates
- Native implementation would be most reliable

**Pros:**

- No implementation effort
- Would work correctly with Teams' architecture
- No risk of breaking changes

**Cons:**

- Unknown timeline (possibly never)
- Users would not have feature in the meantime

**Effort:** Zero

## Recommendations

### Short Term: Do Not Implement

**Reasoning:**

1. **Teams PWA Limitation:** The underlying Teams web application does not support multiple windows, making this a fundamental architectural limitation rather than just an application wrapper issue

2. **High Implementation Cost:** Supporting multiple windows would require extensive refactoring:
   - All IPC handlers (72 channels)
   - All browser tools (17 modules)
   - Window lifecycle management
   - State synchronization across windows

3. **Uncertain Benefit:** Even if implemented, the Teams web UI may not function correctly with multiple windows, potentially causing:
   - Authentication issues
   - Session conflicts
   - Unexpected behavior

4. **Maintenance Burden:** Would significantly increase codebase complexity and create ongoing maintenance challenges

### Workaround: Document Current Behavior

Update documentation to explain:

- Teams for Linux is based on the Teams PWA
- Multiple windows/pop-out chats are not available in the Teams PWA
- This is a Microsoft Teams limitation, not a Teams for Linux limitation
- Users seeking this feature should use the native Windows client or request it from Microsoft

### Alternative: Allow Multiple Instances (Advanced Users)

For advanced users who want to run multiple independent instances:

1. Document how to run multiple instances with different userData directories
2. Create a CLI flag or configuration option to bypass single instance lock
3. Warn about implications (separate tray icons, separate login sessions, higher memory)

Example implementation:

```bash
# Instance 1 (default)
teams-for-linux

# Instance 2 (separate profile)
teams-for-linux --user-data-dir=/path/to/profile2 --allow-multiple-instances
```

This provides the functionality without the complexity of true multi-window support.

### Long Term: Monitor Teams PWA

Continue monitoring Microsoft Teams PWA development. If Microsoft adds native multi-window support to the PWA, then:

1. Evaluate if Teams for Linux needs changes to support it
2. Implement minimal changes to enable the feature
3. Update documentation

## Conclusion

While the request is understandable (native client has this feature), implementing multiple windows for a single account is:

- **Technically complex:** Requires extensive refactoring of IPC, state management, and browser tools
- **Architecturally constrained:** Limited by Teams PWA capabilities
- **High risk:** May break with Teams updates or not work as expected
- **High maintenance:** Ongoing burden for edge cases and coordination logic

**Recommendation:** Document the limitation as a Teams PWA constraint, and optionally provide an "allow multiple instances" flag for advanced users who understand the trade-offs.

## References

- GitHub Issue: [#1984 - Allow multiple windows for one account](https://github.com/IsmaelMartinez/teams-for-linux/issues/1984)
- Microsoft Teams PWA Documentation: https://learn.microsoft.com/en-us/microsoftteams/teams-progressive-web-apps
- Teams PWA Linux Announcement: https://techcommunity.microsoft.com/t5/microsoft-teams-blog/microsoft-teams-progressive-web-app-now-available-on-linux/bc-p/3675594

## Code References

Key files analyzed:

- `app/index.js:61` - Single instance lock implementation
- `app/mainAppWindow/index.js:299-314` - Second instance handler
- `app/mainAppWindow/index.js:530-553` - Window open handler
- `app/mainAppWindow/browserWindowManager.js` - Window creation
- `app/security/ipcValidator.js` - IPC channel allowlist (72 channels)
- `app/browser/tools/` - Browser tools that assume single window (17 modules)
- `app/browser/preload.js` - Tool initialization
