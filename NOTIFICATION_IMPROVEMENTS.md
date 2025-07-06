# Notification System Improvements

## Overview

This document describes the enhancements made to the Teams for Linux notification system to address missing notifications for meetings and chats in Teams v2, specifically targeting GitHub issue #1234.

## Problem Statement

The original notification system had limitations that caused missing notifications, particularly for:
- Meeting start/join events
- Meeting invitations
- Chat messages
- Screen sharing events
- Various Teams v2 interactions

The issue was particularly noticeable with `notificationMethod: "web"` where notifications weren't being triggered for these events.

## Root Cause Analysis

### Original Architecture
1. **Browser Notification Interception**: Teams for Linux replaces `window.Notification` with `CustomNotification`
2. **Limited Event Detection**: The `activityHub.js` only handled 4 basic call events
3. **Missing Event Triggers**: No mechanism to programmatically create notifications for detected Teams events
4. **Teams v2 Changes**: Teams v2 web app may not be creating native notifications for all events

### The Missing Link
The app could detect some Teams events but wasn't comprehensive enough, and there was no automatic notification generation for detected events that Teams itself wasn't notifying about.

## Solution Implementation

### 1. Expanded Event Detection (`activityHub.js`)

**Added New Supported Events:**
```javascript
const supportedEvents = [
  "incoming-call-created",
  "incoming-call-ended", 
  "call-connected",
  "call-disconnected",
  "meeting-started",        // NEW
  "meeting-joined",         // NEW
  "meeting-left",           // NEW
  "meeting-invitation",     // NEW
  "chat-message",           // NEW
  "screen-sharing-started"  // NEW
];
```

**Enhanced Event Filtering:**
- Expanded event types to include `"Rendered"`, `"ChunkLoadStarted"`, `"ChunkLoadSucceeded"`
- Added more target sources for broader event capture
- Improved event pattern matching

**New Event Handler Function:**
```javascript
function handleMeetingChatEvents(event) {
  // Comprehensive pattern matching for:
  // - Meeting start/join detection
  // - Meeting invitation detection  
  // - Screen sharing detection
  // - Chat message detection
  // - Meeting end detection
}
```

### 2. Programmatic Notification Generation (`activityManager.js`)

**New Event Handlers with Automatic Notifications:**
- `meetingStartedHandler`: Triggers notification when meetings start
- `meetingJoinedHandler`: Triggers notification when joining meetings
- `meetingLeftHandler`: Triggers notification when leaving meetings
- `meetingInvitationHandler`: Triggers notification for meeting invitations
- `chatMessageHandler`: Triggers notification for new chat messages
- `screenSharingStartedHandler`: Triggers notification when screen sharing starts

**Key Feature: Programmatic Notification Creation**
Each handler automatically creates notifications using the intercepted `window.Notification`:

```javascript
if (window.Notification && !self.config.disableNotifications) {
  const notification = new window.Notification(data.title || "Meeting Started", {
    body: data.text || "You have joined a meeting",
    icon: data.image,
    type: "meeting-started"
  });
  notification.onclick = () => {
    console.debug("Meeting notification clicked");
  };
}
```

This ensures notifications are shown regardless of whether Teams itself creates them.

## Technical Implementation Details

### Event Detection Patterns

The system now detects events based on multiple patterns:

**Meeting Events:**
- `step`: `"render_calling_screen"`, `"calling-screen-rendered"`
- `entityType`: `"calls"` with `entityAction`: `"create"`
- `crossClientScenario`: `"meeting_invitation"`

**Chat Events:**
- Steps containing `"message"`
- Scenario names containing `"chat"`
- Entity types of `"chat"`

**Screen Sharing:**
- Steps containing `"screen_share"`
- Scenario names containing `"screen_share"`

### Notification Flow

1. **Event Detection**: Teams events are captured by the enhanced `commandChangeReportingService` listener
2. **Pattern Matching**: Events are analyzed using improved pattern detection in `handleMeetingChatEvents`
3. **Event Emission**: Matching events trigger the appropriate event handlers in `activityHub`
4. **Notification Creation**: `activityManager` handlers automatically create notifications via `window.Notification`
5. **Routing**: `CustomNotification` routes notifications based on `notificationMethod` configuration

### Configuration Compatibility

The improvements respect all existing notification settings:
- `disableNotifications`: Prevents all notification creation
- `notificationMethod`: Supports both "web" and "electron" methods
- `disableNotificationSound`: Controls sound playback
- All other notification preferences are preserved

## Testing Recommendations

### 1. Meeting Event Testing
- Join a meeting and verify "Meeting Started" notification appears
- Leave a meeting and verify "Meeting Ended" notification appears
- Create a meeting invitation and verify notification appears

### 2. Chat Message Testing  
- Send/receive chat messages and verify notifications appear
- Test both direct messages and group chats

### 3. Screen Sharing Testing
- Start screen sharing and verify notification appears
- Test both sharing your screen and when others share

### 4. Configuration Testing
- Test with `notificationMethod: "web"` and `notificationMethod: "electron"`
- Test with `disableNotifications: true` (should prevent all notifications)
- Test notification sound settings

### 5. Debug Testing
- Monitor browser console for event detection logs
- Verify enhanced debug logging shows detected call/meeting events
- Check that programmatically created notifications appear in logs

## Backward Compatibility

- All existing functionality is preserved
- No breaking changes to configuration
- Original call event handling remains unchanged
- Existing notification preferences are respected

## Performance Considerations

- Event filtering is optimized to process only relevant events
- Pattern matching uses efficient string operations
- No polling or intensive operations added
- Minimal memory overhead from additional event handlers

## Expected Outcomes

This enhancement should resolve GitHub issue #1234 by:

1. **Comprehensive Event Detection**: Capturing a much broader range of Teams events
2. **Reliable Notification Generation**: Programmatically creating notifications for events that Teams doesn't notify about
3. **Teams v2 Compatibility**: Working regardless of Teams web app notification behavior
4. **Configuration Flexibility**: Supporting both web and electron notification methods

The notification system should now provide consistent and reliable notifications for meetings, chats, and other Teams activities in both Teams v1 and Teams v2.

## Future Enhancements

Potential areas for further improvement:
- Fine-tuning event pattern detection based on user feedback
- Adding user-configurable notification filtering
- Implementing notification priority levels
- Adding custom notification templates
- Supporting additional Teams event types as they're identified

## Debugging

If notifications are still missing:

1. **Enable Debug Logging**: The enhanced event detection includes comprehensive debugging
2. **Check Browser Console**: Look for "🔥 CALL/MEETING EVENT DETECTED 🔥" messages
3. **Verify Configuration**: Ensure `disableNotifications` is not set to `true`
4. **Test Event Detection**: Monitor console logs during Teams interactions
5. **Check Notification Permissions**: Verify browser/system notification permissions

The improved system provides extensive logging to help diagnose any remaining notification issues.
