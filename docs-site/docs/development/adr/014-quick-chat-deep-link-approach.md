---
id: 014-quick-chat-deep-link-approach
---

# ADR 014: Quick Chat Access via Deep Links

## Status

Accepted

## Context

Issue [#2109](https://github.com/IsmaelMartinez/teams-for-linux/issues/2109) (originally [#1984](https://github.com/IsmaelMartinez/teams-for-linux/issues/1984)) requested quick access to chat functionality without requiring full navigation through the Teams UI.

**Investigation Date:** January 2025
**Requested Features:**
- Quick access to start/open chat conversations
- User search functionality
- Lightweight modal interface

This feature was investigated as an alternative after multiple windows support was rejected ([ADR 010](010-multiple-windows-support.md)).

## Decision

**Implement Quick Chat Access using Deep Links + People API.**

The Chat API approach was rejected due to API permission blockers. Instead, we will use:
- **People API** (`/me/people`) for contact search
- **Deep Links** (`/l/chat/0/0?users=email`) for navigation to chat

### Validation Results (2025-01-31)

#### Option 1: Microsoft Graph Chat API (REJECTED)

**Spike Result:** BLOCKED

| Test | Endpoint | Result |
|------|----------|--------|
| Chat Permissions | `GET /me/chats?$top=1` | 403 Forbidden |

**Error:** "Missing scope permissions on the request. API requires one of 'Chat.Read, Chat.ReadBasic, Chat.ReadWrite...'"

**Why Blocked:** The Teams authentication token provided to the embedded web application does not include `Chat.Read` or `Chat.ReadWrite` scopes. This is a fundamental limitation of how Microsoft has designed Teams permissions - chat functionality requires explicit consent that cannot be obtained through the embedded web app token.

**Capabilities if it had worked:**
- List user's chats
- Get chat messages
- Send messages inline
- Full chat modal with message history

#### Option 2: Deep Links + People API (ACCEPTED)

**Spike Result:** PASS

| Test | Endpoint | Result |
|------|----------|--------|
| People API | `GET /me/people?$top=5` | 200 OK |
| Deep Link | Navigate to `/l/chat/0/0?users=email` | Works |

**Capabilities:**
- Search contacts by relevance (People API returns contacts ranked by interaction frequency)
- Navigate Teams to chat with specified user (causes page refresh but functional)
- Uses current Teams origin automatically

### Rationale

1. **API Availability:** People API works with available token permissions while Chat API is blocked.

2. **Practical Functionality:** Deep links provide the core use case (quick access to start a chat with someone) even without inline messaging.

3. **Lower Complexity:** No need to implement message rendering, sending, or real-time updates.

4. **Extensible:** Can enhance notification clicks to open chat with sender using the same mechanism.

5. **User Experience:** While not as rich as inline chat, navigating Teams to the correct chat is still valuable for quick access.

## Consequences

### Positive

- Users can quickly search for contacts and open chat with them
- Implementation complexity is significantly reduced
- Works within available API permissions
- Can be enhanced with keyboard shortcuts for faster access
- Foundation for notification enhancement (click to open chat with sender)

### Negative

- No inline message history display (API blocked)
- No inline message sending (must use Teams native UI)
- Page refresh occurs when navigating via deep link
- Less integrated experience than originally envisioned

### Neutral

- Feature scope is reduced but still provides value
- May revisit Chat API approach if Microsoft changes token permissions
- Users must use Teams native UI for actual messaging

## Alternatives Considered

### Full Chat Modal with Graph API

Original design using Chat API for complete inline chat experience.

**Pros:**
- Rich inline messaging experience
- Message history display
- Send messages without leaving current context

**Cons:**
- API permissions blocked (403 Forbidden)
- Cannot be implemented with available token

**Why rejected:** Technical blocker - Chat API not accessible with Teams token.

### No Implementation

Leave feature unimplemented.

**Pros:**
- No development effort
- No additional complexity

**Cons:**
- Does not address user request
- No quick chat access functionality

**Why rejected:** Deep link approach provides meaningful functionality with reasonable effort.

### External Deep Links (msteams://)

Use `msteams://` protocol URLs to open Teams native client.

**Pros:**
- Works without API access
- Opens in native Teams client if installed

**Cons:**
- Opens external application
- May not work if native Teams not installed
- Poor experience for Linux users (Teams for Linux IS their Teams client)

**Why rejected:** Users want to stay within Teams for Linux, not open external applications.

## Implementation

### Components

1. **People API Integration**
   - Add `searchPeople()` method to GraphApiClient
   - Returns contacts ranked by interaction frequency
   - Supports search query for filtering

2. **QuickChatModal**
   - Modal window for user search
   - Contact list with search results
   - Click to navigate to chat via deep link

3. **Deep Link Navigation**
   - `openChatWithUser(email)` function
   - Constructs URL: `{currentOrigin}/l/chat/0/0?users={email}`
   - Navigates main window to chat

4. **Keyboard Shortcut**
   - Configurable shortcut to open quick chat modal
   - Default: Ctrl+Shift+P (P for People; Ctrl+Shift+C conflicts with Teams calendar)

### IPC Channels

```javascript
// Required IPC channels
'quick-chat:show'           // Show the quick chat modal
'quick-chat:hide'           // Hide the modal
'quick-chat:search-people'  // Search contacts via People API
'quick-chat:open-chat'      // Navigate to chat with user
```

### Configuration

```json
{
  "quickChat": {
    "enabled": true,
    "shortcut": "Ctrl+Shift+P"
  }
}
```

## Related

- Issue [#2109](https://github.com/IsmaelMartinez/teams-for-linux/issues/2109) - Quick Chat Access feature request
- Issue [#1984](https://github.com/IsmaelMartinez/teams-for-linux/issues/1984) - Original multiple windows request
- [ADR 010](010-multiple-windows-support.md) - Multiple windows support rejection
- [Chat Modal Investigation](../research/chat-modal-investigation.md) - Feature research
- [Chat Modal Spike Results](../research/chat-modal-spike-results.md) - API validation results

## References

- [Microsoft Graph People API](https://learn.microsoft.com/en-us/graph/api/user-list-people)
- [Teams Deep Links](https://learn.microsoft.com/en-us/microsoftteams/platform/concepts/build-and-test/deep-links)
