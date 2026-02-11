---
id: 015-quick-chat-inline-messaging
---

# ADR 015: Quick Chat Inline Messaging

## Status

Implemented

## Context

ADR 014 documented the Quick Chat feature using People API + deep links for contact search and chat navigation. That approach worked but had significant limitations: no inline message sending, no inline message history, and a page refresh when navigating via deep link. Users had to switch context to the Teams UI to actually type and send a message, which undermined the "quick" aspect of the feature.

Issue [#1984](https://github.com/IsmaelMartinez/teams-for-linux/issues/1984) originally requested quick chat access, and inline messaging was always the intended goal. A research spike was conducted to discover how Teams sends messages internally, since the Graph API Chat endpoints require `Chat.Create` and `Chat.ReadWrite` scopes that are not available in the Teams embedded web app token.

The spike revealed that Teams uses an IC3 (Internal Communications 3) chat service with a CDL Web Worker architecture for message sending. However, the available Graph API token does include `ChatMessage.Send` and `ChatMember.Read` scopes, which are sufficient to send messages and verify chat membership through the standard Graph API — provided we can resolve the correct chat thread ID for a 1:1 conversation.

## Decision

Implement inline message sending in the Quick Chat modal using a hybrid approach that combines Teams' internal chat commanding with Graph API message delivery.

The flow works as follows. When a user selects a contact and types a message, the system first calls Teams' internal `entityCommanding.chat.chatWithUsers()` via `executeJavaScript` on the main window's webContents, passing the recipient's MRI (Microsoft Resource Identifier in `8:orgid:{aad-id}` format). This ensures the 1:1 chat exists and Teams navigates to it internally. After a brief delay for Teams to process the navigation, the system scans the DOM for chat thread IDs matching the pattern `19:{id}@thread.v2` or `19:{id}@unq.gbl.spaces`, excluding meeting threads. Each candidate is then verified via `GET /chats/{chatId}/members` (using the `ChatMember.Read` scope) to find the 1:1 chat (exactly 2 members) that contains the target user. Once identified, the message is sent via `POST /chats/{chatId}/messages` using the `ChatMessage.Send` scope.

The compose view replaces the contact list in the modal when a contact is clicked, showing a message input with send button. Enter sends the message (Shift+Enter for newline), and a back button returns to search results.

### Configuration

The feature requires both `graphApi.enabled` and `quickChat.enabled` to be true. The inline messaging capability is available automatically when these are enabled — no additional configuration is needed:

```json
{
  "graphApi": {
    "enabled": true
  },
  "quickChat": {
    "enabled": true,
    "shortcut": "CommandOrControl+Shift+P"
  }
}
```

## Consequences

### Positive

- Users can send messages directly from the Quick Chat modal without navigating away
- No page refresh or context switch required
- Works within available token permissions (`ChatMessage.Send`, `ChatMember.Read`)
- The member verification step ensures messages are sent to the correct 1:1 chat
- Compose view preserves search results for sending to multiple contacts

### Negative

- The conversation resolution process takes a few seconds due to DOM scanning and member verification API calls
- Region for the `entityCommanding` service is not dynamically discovered (hardcoded behavior from Teams' own navigation)
- DOM scanning is inherently fragile — if Teams changes its attribute structure, thread IDs may not be found
- No inline message history (reading messages still requires `Chat.Read` scope which is unavailable)
- Messaging depends on an existing 1:1 thread; users must have already chatted with the recipient because `Chat.Create` is unavailable
- Sending a message to yourself is unsupported and can misroute the message to the last active 1:1 thread
- External/federated contacts are not reliably supported by the current thread resolution flow

### Neutral

- The `entityCommanding.chat.chatWithUsers()` method is an internal Teams API accessed via React fiber tree traversal; it may change without notice in Teams updates
- The People API `id` field maps directly to the AAD object ID, which matches the `userId` field on chat member objects from the Graph API
- 1:1 chat thread IDs use the `uni01_` format (`19:uni01_{base64}@thread.v2`), distinct from group chat hex GUIDs

## Alternatives Considered

### IC3 Chat Service Direct API

The research spike discovered the exact IC3 endpoint Teams uses (`POST /api/chatsvc/{region}/v1/users/ME/conversations/{conversationId}/messages`). This approach would use a separate IC3 token (audience `https://ic3.teams.office.com`) to call the same internal API.

**Why rejected:** During testing, messages sent via the IC3 endpoint returned 201 Created but did not appear in the recipient's chat. The IC3 service likely requires additional context (CDL worker state, trouter registration) that is not available when calling from the Electron main process. The Graph API `ChatMessage.Send` approach proved more reliable.

### Graph API Chat Creation (`POST /v1.0/chats`)

Create the 1:1 chat via Graph API before sending a message, avoiding DOM scanning entirely.

**Why rejected:** The token lacks the `Chat.Create` scope (returns 403 Forbidden). This is a fundamental permission limitation of the Teams embedded web app token.

### Deep Link Navigation Only (ADR 014 approach)

Continue with the existing deep link approach without inline messaging.

**Why rejected:** The deep link approach causes a full page refresh and requires the user to switch context to type their message in the Teams UI, which defeats the purpose of a "quick" chat feature.

### React Fiber Tree Traversal for Thread ID

Instead of DOM scanning, traverse the React component tree to extract the current conversation ID from component props/state.

**Why rejected:** The React fiber tree is extremely large (thousands of nodes) and traversal caused the renderer to hang. DOM attribute scanning with Graph API member verification proved more reliable.

## Related

- [ADR 014](014-quick-chat-deep-link-approach.md) - Original Quick Chat deep link approach (superseded for messaging)
- [ADR 010](010-multiple-windows-support.md) - Multiple windows support rejection
- Issue [#1984](https://github.com/IsmaelMartinez/teams-for-linux/issues/1984) - Original feature request
- PR [#2119](https://github.com/IsmaelMartinez/teams-for-linux/pull/2119) - Implementation PR

## References

- [Microsoft Graph Chat Messages API](https://learn.microsoft.com/en-us/graph/api/chat-post-messages)
- [Microsoft Graph Chat Members API](https://learn.microsoft.com/en-us/graph/api/chat-list-members)
- [Microsoft Graph People API](https://learn.microsoft.com/en-us/graph/api/user-list-people)
