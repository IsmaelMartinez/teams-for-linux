# MQTT Semantic Categories - Expansion Roadmap

**Status**: Future Planning (YAGNI - Not Implementing Yet)
**Purpose**: Document how semantic categories scale to future use cases

---

## Current Implementation (Issue #1938)

```json
{
  "mqtt": {
    "presence": { "enabled": true, "topic": "status" },
    "camera": { "enabled": false, "topic": "camera" },
    "microphone": { "enabled": false, "topic": "microphone" },
    "call": { "enabled": false, "topic": "in-call" }
  }
}
```

**Detection strategy**: WebRTC stream monitoring (getUserMedia)

---

## Future Categories (Requested by Users)

### Notifications & Messages

```json
{
  "mqtt": {
    "messageCount": {
      "enabled": false,
      "topic": "messages/unread"
    },
    "newMessage": {
      "enabled": false,
      "topic": "messages/new",
      "includeContent": false  // Privacy option
    },
    "mentions": {
      "enabled": false,
      "topic": "messages/mentions"
    }
  }
}
```

**Detection strategy**:
- DOM monitoring (title bar badge count: "Teams (3)")
- MutationObserver on notification elements
- Existing `mutationTitle.js` already does this!

**Potential topics**:
- `teams/messages/unread` → `"5"`
- `teams/messages/new` → JSON with sender, timestamp (if enabled)
- `teams/messages/mentions` → `"true"` when @mentioned

---

### Calendar & Meetings

```json
{
  "mqtt": {
    "nextMeeting": {
      "enabled": false,
      "topic": "calendar/next"
    },
    "meetingStarting": {
      "enabled": false,
      "topic": "calendar/starting-soon",
      "minutesBefore": 5
    },
    "meetingDuration": {
      "enabled": false,
      "topic": "calendar/duration"
    }
  }
}
```

**Detection strategy**:
- **Option 1**: Microsoft Graph API Calendar (Issue #1832 - when implemented)
- **Option 2**: DOM scraping of calendar panel (fragile)

**Potential topics**:
- `teams/calendar/next` → JSON: `{ "subject": "Sprint Planning", "startTime": "2025-11-16T14:00:00Z" }`
- `teams/calendar/starting-soon` → `"true"` (5 minutes before)
- `teams/calendar/duration` → `"60"` (minutes)

**Use case**: Pre-warm RGB LEDs before meeting starts

---

### Screen Sharing

```json
{
  "mqtt": {
    "screenSharing": {
      "enabled": false,
      "topic": "screen-sharing"
    }
  }
}
```

**Detection strategy**: Already implemented! `app/screenSharing/injectedScreenSharing.js`
- IPC events: `screen-sharing-started`, `screen-sharing-stopped`
- Just wire to MQTT

**Potential topics**:
- `teams/screen-sharing` → `"true"`/`"false"`

---

### Reactions & Engagement

```json
{
  "mqtt": {
    "handRaised": {
      "enabled": false,
      "topic": "hand-raised"
    },
    "reactions": {
      "enabled": false,
      "topic": "reactions/latest"
    }
  }
}
```

**Detection strategy**: DOM monitoring of reaction UI elements

**Potential topics**:
- `teams/hand-raised` → `"true"`/`"false"`
- `teams/reactions/latest` → `"thumbsup"`, `"heart"`, etc.

---

### Recording & Transcription

```json
{
  "mqtt": {
    "recording": {
      "enabled": false,
      "topic": "recording"
    },
    "transcription": {
      "enabled": false,
      "topic": "transcription"
    }
  }
}
```

**Detection strategy**: DOM monitoring (recording indicator banner)

**Potential topics**:
- `teams/recording` → `"true"`/`"false"`
- `teams/transcription` → `"true"`/`"false"`

**Use case**: Privacy indicator (LED turns purple when recording active)

---

### Participant Count

```json
{
  "mqtt": {
    "participantCount": {
      "enabled": false,
      "topic": "participants/count"
    }
  }
}
```

**Detection strategy**: DOM monitoring of participant roster panel

**Potential topics**:
- `teams/participants/count` → `"8"`

---

## Pattern Analysis

### ✅ What Works (Semantic Categories)

Each category is **what it represents**:
- `camera` = camera state
- `messageCount` = message count
- `nextMeeting` = next meeting info
- `recording` = recording state

**Not** grouped by:
- ❌ Technical implementation ("dom-based", "webrtc-based")
- ❌ Temporal classification ("extended", "new", "v2")
- ❌ Feature grouping ("notifications", "media")

### Configuration Pattern

Every category follows same structure:
```json
{
  "categoryName": {
    "enabled": false,
    "topic": "path/to/topic",
    // Optional category-specific settings
    "otherSetting": value
  }
}
```

**Benefits**:
- Self-documenting (category name explains what it does)
- Independently configurable (enable only what you need)
- Consistent pattern (easy to understand)
- Privacy-friendly (opt-in per category)

---

## Implementation Priority (Future)

### High Demand (Likely Next)
1. **Screen sharing** - Already detected, just wire to MQTT
2. **Message count** - Already detected (`mutationTitle.js`), just publish
3. **Calendar/next meeting** - Wait for Graph API (#1832)

### Medium Demand
4. **Recording indicator** - Privacy use case
5. **Hand raised** - Meeting engagement
6. **Participant count** - Room capacity automation

### Lower Priority (Wait for Requests)
7. **Reactions** - Nice-to-have
8. **New message content** - Privacy concerns
9. **Transcription** - Niche use case

---

## Detection Strategy Summary

| Category | Detection Method | Complexity | Fragility |
|----------|-----------------|------------|-----------|
| **Presence** | DOM (current) | Low | Medium |
| **Camera/Mic/Call** | WebRTC streams | Medium | Low ✅ |
| **Message count** | DOM (title/badge) | Low | Medium |
| **Screen sharing** | IPC (existing) | Low | Low ✅ |
| **Calendar** | Graph API | Medium | Low ✅ |
| **Recording** | DOM (banner) | Low | High ⚠️ |
| **Hand raised** | DOM (button) | Low | High ⚠️ |
| **Reactions** | DOM (elements) | Low | High ⚠️ |
| **Participant count** | DOM (roster) | Medium | High ⚠️ |

**Key**:
- ✅ **Low fragility**: Stable APIs (WebRTC, IPC, Graph)
- ⚠️ **High fragility**: DOM scraping (Microsoft can change UI)

---

## Recommended Approach

### Phase 1: Stable APIs First (Current + Near Future)
1. Camera/mic/call (WebRTC) ← **Current implementation**
2. Screen sharing (IPC events) ← **Easy win**
3. Message count (title monitoring) ← **Easy win**
4. Calendar (Graph API) ← **Wait for #1832**

### Phase 2: DOM-Based (Only If Requested)
5. Recording indicator
6. Hand raised
7. Participant count

**Rationale**: Build on stable foundations (WebRTC, IPC, Graph API) before fragile DOM scraping

---

## Generic `publish()` Method Supports All

The generic `publish()` method we're adding supports all future categories:

```javascript
// Camera (WebRTC)
await mqttClient.publish('teams/camera', 'true');

// Screen sharing (IPC)
await mqttClient.publish('teams/screen-sharing', 'true');

// Message count (DOM)
await mqttClient.publish('teams/messages/unread', '5');

// Calendar (Graph API)
await mqttClient.publish('teams/calendar/next', JSON.stringify({
  subject: "Sprint Planning",
  startTime: "2025-11-16T14:00:00Z"
}));

// Recording (DOM)
await mqttClient.publish('teams/recording', 'false');
```

**One method handles everything** - no specialized methods needed.

---

## IPC Channel Strategy for Future

### Pattern 1: One IPC per Detection Strategy

```javascript
// WebRTC stream data (camera/mic/call) - detected together
ipcMain.handle('mqtt-media-status-changed', ...);

// Screen sharing (IPC events) - already separate
ipcMain.handle('screen-sharing-started', ...);
ipcMain.handle('screen-sharing-stopped', ...);

// DOM-based data (messages/reactions/etc.) - detected together from DOM
ipcMain.handle('mqtt-dom-status-changed', ...);

// Graph API data (calendar/presence) - fetched together from API
ipcMain.handle('mqtt-graph-status-changed', ...);
```

**Why group by detection strategy?**
- Data detected together is sent together (efficient)
- Each detection mechanism = one IPC channel
- Handler selectively publishes based on config

### Pattern 2: One IPC per Semantic Category (Alternative)

```javascript
ipcMain.handle('mqtt-camera-changed', ...);
ipcMain.handle('mqtt-microphone-changed', ...);
ipcMain.handle('mqtt-message-count-changed', ...);
// ... many channels
```

**Why NOT this?**
- Too many IPC channels (overhead)
- Camera/mic/call detected simultaneously (wasteful to send 3 messages)
- Harder to maintain

**Recommendation**: Pattern 1 (group by detection strategy)

---

## Decision: Semantic Categories Scale Perfectly

**Conclusion**: The semantic category pattern we chose scales to all future use cases:
- ✅ Clear what each setting controls
- ✅ Independently configurable
- ✅ Self-documenting
- ✅ Privacy-friendly (opt-in)
- ✅ Generic `publish()` supports all
- ✅ No refactoring needed to add new categories

**Implementation strategy**: YAGNI - Add categories **only when users request them**, starting with stable APIs (WebRTC, IPC, Graph) before fragile DOM scraping.
