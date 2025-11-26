---
id: 009-multiple-windows-support
---

# ADR 009: Multiple Windows Support for Single Account

## Status

❌ Rejected

## Context

Issue [#1984](https://github.com/IsmaelMartinez/teams-for-linux/issues/1984) requested the ability to open multiple windows for a single account, similar to the native Windows Teams client's pop-out functionality for chats and meetings.

**Investigation Date:** November 2025
**Requested Features:**
- Pop-out windows for individual chats
- Separate windows for meetings
- Simultaneous access to meetings and chat conversations

The user believed the Teams PWA previously supported this feature and it was disabled, but investigation revealed this is incorrect.

## Decision

**Reject multiple windows support.** The application will continue to use a single-window model.

### Rationale

1. **Teams PWA Limitation:** Microsoft Teams PWA does not natively support multiple windows or pop-out chats. This is a fundamental limitation of the web application itself, not the Electron wrapper.

2. **Architectural Complexity:** Current architecture assumes single-window operation:
   - Single instance lock prevents multiple app instances
   - 72 IPC channels designed for single-window communication
   - 17 browser tools assume single window context (tray updates, activity tracking, authentication)
   - State management scattered with module-level variables

3. **Extensive Refactoring Required:**
   - All IPC handlers would need window identification and state aggregation
   - Browser tools would need coordination across windows
   - Complex questions with no clear answers:
     - Which window's unread count shows in tray?
     - How to handle call state across windows?
     - Which window receives notifications?
     - How to manage screen sharing state?

4. **Uncertain Benefit:** Even if implemented, Teams web UI may not function correctly with multiple windows due to:
   - Potential authentication/session conflicts
   - Shared workers or service workers expecting single window
   - Unexpected behavior from web app not designed for this use case

5. **High Maintenance Burden:** Would significantly increase codebase complexity with ongoing maintenance challenges as Teams web evolves.

## Consequences

### Positive

- ✅ Maintains simple, proven single-window architecture
- ✅ Reduces complexity and testing burden
- ✅ Avoids potential authentication and session issues
- ✅ No ongoing maintenance for multi-window coordination

### Negative

- ⚠️ Users cannot pop out chats or meetings into separate windows
- ⚠️ Feature disparity with native Windows client
- ⚠️ Users must choose between meeting view and chat view

### Neutral

- Continue monitoring Microsoft Teams PWA development
- If Microsoft adds native multi-window support to PWA, re-evaluate with minimal changes
- Document limitation clearly for users

## Alternatives Considered

### Option 1: Allow Multiple Independent Instances

Run multiple completely independent instances with separate userData directories.

**Pros:**
- Simple implementation (remove single instance lock)
- Each window fully isolated
- No state synchronization needed

**Cons:**
- Each instance has separate tray icon
- No coordination between windows
- Higher memory usage
- Separate login sessions
- Does not achieve desired "pop-out" behavior

**Why rejected:** Does not provide the integrated experience users expect. However, this could be offered as an advanced user option via CLI flag.

### Option 2: Primary + Secondary Window Pattern

Maintain one primary window and allow secondary windows with limited functionality.

**Pros:**
- Clear ownership of global state
- Reduced complexity vs full multi-window
- Aligns with native client behavior

**Cons:**
- Still requires extensive IPC refactoring
- Browser tools need window-type awareness
- Unknown if Teams web UI supports this model
- Complex window lifecycle management

**Why rejected:** High implementation cost for uncertain benefit given Teams PWA limitations.

### Option 3: Single Window with BrowserViews

Use Electron BrowserViews to create "virtual" windows within single window.

**Pros:**
- No IPC refactoring needed
- Single window context preserved
- Lower memory usage

**Cons:**
- Not true separate windows (can't move to different monitors easily)
- Requires custom window management UI
- Does not match user expectations

**Why rejected:** Does not provide true separate window experience users want.

## Future Considerations

### Multiple Instances (Already Supported)

Users can already run multiple independent instances by specifying different user data directories:

```bash
# Instance 1 (default)
teams-for-linux

# Instance 2 (separate profile)
teams-for-linux --user-data-dir=/path/to/profile2
```

Each instance operates independently with:
- Separate tray icons
- Separate login sessions
- Separate configuration
- Higher memory usage
- No coordination between instances

**Note:** This is a workaround, not the integrated multi-window experience users expect from the native client, but it provides the ability to view different accounts or contexts simultaneously.

### Monitor Teams PWA Evolution

If Microsoft adds native multi-window support to Teams PWA:
1. Evaluate minimal changes needed in Teams for Linux
2. Implement support for native feature
3. Update documentation

**Estimated timeline for Microsoft PWA multi-window:** Unknown, likely 12+ months if at all

## Related

- Issue [#1984](https://github.com/IsmaelMartinez/teams-for-linux/issues/1984) - Allow multiple windows for one account
- `app/index.js:61` - Single instance lock implementation
- `app/mainAppWindow/index.js:530-553` - Window open handler
- `app/security/ipcValidator.js` - IPC channel validation (72 channels)

## References

- [Teams Progressive Web Apps - Microsoft Learn](https://learn.microsoft.com/en-us/microsoftteams/teams-progressive-web-apps)
- [Microsoft Teams PWA on Linux](https://techcommunity.microsoft.com/t5/microsoft-teams-blog/microsoft-teams-progressive-web-app-now-available-on-linux/bc-p/3675594)
- Microsoft community discussions confirming PWA multi-window limitation
