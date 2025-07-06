# Microsoft Teams Event Analysis for Call/Meeting Detection

## Overview
This document analyzes the events captured from Microsoft Teams' internal `commandChangeReportingService` to identify patterns that can be used to detect calls and meetings in the Teams for Linux application.

## Key Event Patterns Identified

### 1. Call Creation Flow
When a user initiates a direct call, several key patterns emerge:

**Primary Indicators:**
- `entityCommand.entity.type: "calls"` with `action: "create"`
- `scenarioName: "calling_entity_command_calls_create"`
- `source: "CallingAppEvent_Windowing::SingleWindowNavigation::StartMeetupInChannelHeader"`

**Step Values:**
- `call_creation` - Initial call creation request
- `call_creation_request` - Call creation processing
- `calling_started` - Calling service started
- `render_prejoin` - Pre-join screen rendering
- `calling-screen-rendered` - Main calling screen displayed
- `calling_context` - Calling context established

### 2. Call Pre-Join/Cancel Flow  
When a user navigates to the pre-join screen or cancels a call:

**Primary Indicators:**
- `entityCommand.entity.type: "calls"` with `action: "view"`
- `scenarioName: "calling_entity_command_calls_view"`
- `source: "CallingAppEvent_Windowing::SingleWindowNavigation::StartMeetupInChannelHeader"`

**Step Values:**
- `render_prejoin` - Pre-join screen rendering (multiple occurrences)
- `calling-screen-rendered` - Calling interface displayed
- `pause_ongoing_calling_scenarios` - Scenarios paused (with `pauseReason: "pre-join-screen"`)
- `calling_context` - Calling context setup
- `transport_companion_device_info_done` - Device info collection complete
- `call_data_done` - Call data retrieval complete
- `calling_intent_query_done` - Intent query processed
- `is_anonymous_user_query_done` - User authentication check

**Key Differences from Creation:**
- Action changes from `"create"` to `"view"`
- Scenario name changes to `"calling_entity_command_calls_view"`
- Multiple `render_prejoin` steps indicate pre-join screen rendering
- `pause_ongoing_calling_scenarios` clearly indicates pre-join state

### 3. Call Join/Active Call Flow
When a user actually joins a call and the "invite people to join" screen appears:

**Primary Indicators:**
- `entityCommand.entity.type: "shareMeetingInfo"` with `action: "create"` 
- `source: "CallingScreen"`
- `entityOptions.teamsCallId: "1"`
- `entityOptions.isOpeningOnLanding: true`

**Step Values:**
- `render_call` - Call interface rendering (multiple occurrences)
- `render_calling_screen` - Calling screen display
- `render_calling_views_renderer` - Calling views renderer
- `render_prejoin` - Continues during transition

**Event Types:**
- `ScenarioMarked` - Step progression markers
- `CommandStart` - Command initiation for share meeting info
- `Rendered` - Component rendering completion
- `ChunkLoadStarted/ChunkLoadSucceeded` - Loading calling app chunks
- `ScenarioEventDataAppended` - Entity data with call ID

**Key Differences from Pre-Join:**
- Entity type changes to `"shareMeetingInfo"` 
- Action becomes `"create"` (for invite screen)
- `render_call` step replaces `render_prejoin` as primary step
- Multiple `Rendered` events indicate interface completion
- `teamsCallId` appears in entity options

### 4. Legacy Detection Patterns
These patterns were identified from earlier analysis and may still be relevant:

- `prejoin_mounted` - Pre-join component mounted in DOM
- `prejoin_unmounted` - Pre-join component unmounted (likely when joining)

### 2. Event Structure
Teams events follow this general structure:
```javascript
{
  type: "ScenarioMarked" | "CommandStart" | "CommandEnd",
  context: {
    target: "calling" | "prejoin" | other,
    step: "render_prejoin" | "calling-screen-rendered" | other,
    entityCommand: {
      entityType: "call" | "meeting" | other,
      entityAction: "start" | "join" | "end" | other,
      entityOptions: {
        crossClientScenarioName: "CallStart" | "MeetingJoin" | other,
        isIncomingCall: boolean
      }
    }
  }
}
```

### 3. Detection Strategies

#### Primary Detection (High Confidence)
- **Step-based**: Look for specific step values like `render_prejoin`, `calling-screen-rendered`
- **Target-based**: Events with target containing "calling", "prejoin", "meeting", "call"
- **Entity-based**: entityType="call" or entityAction="join"/"start"

#### Secondary Detection (Medium Confidence)
- **Scenario-based**: crossClientScenarioName containing "CallStart", "CallEnd", "MeetingJoin"
- **Incoming call flag**: isIncomingCall=true

## Implementation Strategy

### Phase 1: Basic Detection (Current)
✅ **Completed**: Enhanced debug logging to highlight call/meeting events based on identified patterns.

The updated `reactHandler.js` now includes:
- Intelligent event filtering using `_isCallMeetingEvent()` method
- Highlighted logging for detected call/meeting events
- Pattern matching for steps, targets, scenarios, and entity types

### Phase 2: Event Mapping (Next Steps)
Map detected patterns to specific actions:

```javascript
const eventMappings = {
  'render_prejoin': 'CALL_PRE_JOIN_SCREEN',
  'calling-screen-rendered': 'CALL_SCREEN_ACTIVE',
  'prejoin_mounted': 'CALL_PRE_JOIN_READY',
  'prejoin_unmounted': 'CALL_JOINING',
  // Add more mappings as discovered
};
```

### Phase 3: Notification Integration
Integrate event detection with existing notification system:

```javascript
// In activityHub.js or similar
onCallEvent(eventType, eventData) {
  switch(eventType) {
    case 'CALL_PRE_JOIN_SCREEN':
      // Show "Preparing to join call" notification
      break;
    case 'CALL_SCREEN_ACTIVE':
      // Show "In call" status, update tray icon
      break;
    case 'CALL_JOINING':
      // Show "Joining call" notification
      break;
  }
}
```

## Testing Scenarios

### Completed Tests
✅ **Call Creation Test**: Initiated a direct call and captured event logs showing clear patterns for call initiation flow.

✅ **Call Pre-Join/Cancel Test**: Navigated to pre-join screen and captured events showing the calling interface rendering and pre-join state patterns.

✅ **Call Join Test**: Actually joined a call and captured the transition to active call state with "invite people to join" screen, showing `shareMeetingInfo` entity creation and `render_call` step patterns.

✅ **Invite Screen Close Test**: Closed the "invite people to meeting" dialog and captured `createAndRegisterHideExtensionCommand` target events with `shareMeetingInfo` entity type and `visibilityState: hide`.

✅ **Screen Sharing Test**: Initiated screen sharing and captured events showing multiple screen sharing flow patterns and UI state changes.

✅ **Call Leave/End Test**: Clicked "Leave meeting" and captured the complete call termination flow showing clear patterns for disconnection and call end events.

### Recommended Additional Tests
1. **Incoming Call**: Have someone call you to capture incoming call events
2. **Scheduled Meeting**: Join a scheduled Teams meeting 
3. **Meeting Invite**: Accept a meeting invitation
4. **Call End**: End an active call to see termination events
5. **Meeting Leave**: Leave an active meeting
6. **Call Rejection**: Reject an incoming call
7. **Meeting Decline**: Decline a meeting invitation

### Test Data Collection
For each test scenario, collect:
- All event logs with 🔥 CALL/MEETING EVENT markers
- Any events that seem call/meeting related but weren't detected
- Timing of events relative to UI changes
- Any error events that occur

## Event Pattern Reference

### Known Call/Meeting Step Values
**From Call Creation Flow:**
- `call_creation` - Initial call creation request
- `call_creation_request` - Call creation processing  
- `calling_started` - Calling service started
- `calling_context` - Calling context established

**From Pre-Join/Cancel Flow:**
- `render_prejoin` - Pre-join screen rendering
- `calling-screen-rendered` - Main calling screen displayed
- `pause_ongoing_calling_scenarios` - Scenarios paused for pre-join
- `transport_companion_device_info_done` - Device info collection complete
- `call_data_done` - Call data retrieval complete
- `calling_intent_query_done` - Intent query processed
- `is_anonymous_user_query_done` - User authentication check

**From Active Call/Join Flow:**
- `render_call` - Call interface rendering (primary active call indicator)
- `render_calling_screen` - Calling screen display
- `render_calling_views_renderer` - Calling views renderer

**From Call Termination/End Flow:**
- `render_disconnecting` - Call is being disconnected/terminated
- `render_disconected` - Call disconnection complete (note: typo in Teams code)
- `render_call_end_screen` - Call end screen being displayed

**From Screen Sharing Flow:**
- Various screen sharing related events occur but specific step patterns still being analyzed

**From Invite Screen/UI Actions:**
- Events with `target: createAndRegisterHideExtensionCommand` and `entityType: shareMeetingInfo` indicate invite dialog actions

**Legacy/Other Patterns:**
- `prejoin_mounted` - Pre-join component mounted in DOM
- `prejoin_unmounted` - Pre-join component unmounted

### Known Target Values
- `calling`
- `prejoin`
- `createAndRegisterHideExtensionCommand` - UI dialog/extension actions
- `meeting` (expected)
- `call` (expected)

### Known Scenario Names
**Confirmed Scenarios:**
- `calling_entity_command_calls_create` - Call creation flow
- `calling_entity_command_calls_view` - Call pre-join/cancel flow

**Expected Scenarios:**
- `CallStart` (expected)
- `CallEnd` (expected)  
- `MeetingJoin` (expected)
- `MeetingLeave` (expected)
- `IncomingCall` (expected)

### Event Types of Interest
- `ScenarioMarked` - Most common, contains step information
- `CommandStart` - Command initiation
- `CommandEnd` - Command completion

## Next Steps

1. **Test the Enhanced Logging**: Run Teams for Linux with the updated debug logging and perform various call/meeting actions. Look for events marked with 🔥.

2. **Expand Pattern Database**: As you test different scenarios, add newly discovered patterns to the `_isCallMeetingEvent()` method.

3. **Implement Action Handlers**: Create specific handlers for each detected event type to trigger appropriate notifications or UI updates.

4. **Performance Optimization**: Once patterns are stable, consider filtering events earlier to reduce logging overhead.

5. **User Configuration**: Add settings to allow users to enable/disable specific call/meeting notifications.

## Debug Commands

To test the enhanced event detection:

```javascript
// In Browser DevTools Console:
// Check if ReactHandler is available
window.ReactHandler = require('./browser/tools/reactHandler.js');

// Manually trigger debug logging (should already be active)
ReactHandler.debugAllEvents();
```

## Notes

- The `commandChangeReportingService` appears to be Microsoft's internal telemetry/analytics system
- Events are fired for various UI state changes and user actions
- Some events may be fired multiple times for the same action
- Event timing may vary - some events fire before UI changes, others after
- The service may not be immediately available on app startup
