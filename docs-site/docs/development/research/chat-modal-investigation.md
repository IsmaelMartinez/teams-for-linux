# Chat Modal Feature Investigation

**Related Issue:** [#1984](https://github.com/IsmaelMartinez/teams-for-linux/issues/1984) - Multiple Windows Investigation
**Date:** 2025-11-26
**Updated:** 2025-01-31
**Status:** Ready for Implementation (Revised Approach)

## Validation Update (2025-01-31)

The original Graph API approach was validated and found to be blocked - the Teams token does not include `Chat.Read` or `Chat.ReadWrite` permissions. However, an alternative approach using People API + Deep Links has been validated and works.

**See:** [Spike Results](chat-modal-spike-results.md) for full validation details.

**Revised Implementation:**
- People API (`/me/people`) works for contact search
- Deep links (`/l/chat/0/0?users=email`) work for opening chat
- No message history or inline send (navigates Teams to chat instead)

This provides quick chat access without requiring blocked API permissions.

## Summary

This document investigates the feasibility of implementing a lightweight chat modal as an alternative to full multi-window support. The modal would allow quick access to chat conversations without requiring the complexity of multiple Teams windows.

## Motivation

Since full multi-window support for Teams was determined to be infeasible (see [ADR 010](../adr/010-multiple-windows-support.md)), a chat modal could provide a simpler alternative that addresses some user needs:

- Quick access to chat without leaving current context (meeting, channel, etc.)
- Ability to send quick messages without navigating away
- ~~View recent message history~~ (blocked - no API access)
- Potential evolution into a notifications panel with reply capabilities

## Existing Foundation

### Custom Notification System Pattern

The application already has a custom notification toast system that can serve as a foundation:

**Implementation:** `app/notificationSystem/`

- **NotificationToast class** (`NotificationToast.js`): Creates small overlay windows using `BrowserWindow`
- **CustomNotificationManager** (`index.js`): Manages toast lifecycle and IPC handlers
- **Architecture:**
  - Transparent, always-on-top BrowserWindow (360x110px)
  - HTML/CSS UI loaded from local files
  - Preload script with context isolation
  - IPC communication for events
  - Auto-close after configurable duration (default 5s)
  - Positioned in bottom-right corner using `electron-positioner`

**Key Features:**

```javascript
// From app/notificationSystem/NotificationToast.js
const window = new BrowserWindow({
  alwaysOnTop: true,
  frame: false,
  transparent: true,
  show: false,
  width: 360,
  height: 110,
  webPreferences: {
    preload: path.join(__dirname, 'notificationToastPreload.js'),
    contextIsolation: true,
    nodeIntegration: false,
  },
});
```

### Microsoft Graph API Integration

The application recently added Graph API support (v2.6.0+) which can be leveraged for chat functionality:

**Implementation:** `app/graphApi/`

- **GraphApiClient** (`index.js`): Makes authenticated requests to Microsoft Graph
- **Token Management:** Acquires and caches tokens via ReactHandler
- **IPC Handlers** (`ipcHandlers.js`): Exposes Graph API to renderer process

**Current Capabilities:**

- ✅ User profile: `/me`
- ✅ Calendar events: `/me/calendar/events`
- ✅ Mail messages: `/me/messages`
- ❌ Chat messages: Not yet implemented

## Microsoft Graph API for Teams Chat

Research into Microsoft Graph API reveals comprehensive chat capabilities:

### Available Endpoints

**List Chats:**

```
GET /me/chats
GET /users/{user-id}/chats
```

Returns list of chat conversations the user is part of.

**List Messages in Chat:**

```
GET /chats/{chat-id}/messages
```

Retrieves messages from a specific chat, with OData query options:

- `$top`: Limit number of results (e.g., `$top=3` for last 3 messages)
- `$orderby`: Sort messages (e.g., `$orderby=createdDateTime desc`)
- `$select`: Choose specific fields to return
- `$filter`: Filter by criteria

**Send Message:**

```
POST /chats/{chat-id}/messages
Content-Type: application/json

{
  "body": {
    "content": "Hello World!"
  }
}
```

**Search Users:**

```
GET /users?$filter=startswith(displayName, 'John') or startswith(userPrincipalName, 'john')
```

### Permissions Required

**Delegated (interactive user) - SUPPORTED:**

- `Chat.Read`: Read user chat messages
- `Chat.ReadWrite`: Read and send user chat messages
- `User.Read.All` or `User.ReadBasic.All`: Search users

**Application (non-interactive) - NOT SUPPORTED:**
Microsoft Graph does not support sending chat messages with application permissions. This is intentional - chat messages must be sent by authenticated users.

### Important Notes

1. **Requires user interaction:** Chat operations require delegated permissions, which the app already uses via ReactHandler token acquisition
2. **Rate limits apply:** Graph API has throttling limits, typically sufficient for reasonable usage
3. **Not for bulk operations:** Microsoft explicitly states this API is not suitable for data migration/bulk operations

## Proposed Architecture

### Phase 1: Basic Chat Modal

**Goal:** Minimal viable chat modal with search and send capabilities.

#### Components

**1. ChatModal Window** (`app/chatModal/ChatModal.js`)

Similar to NotificationToast but larger and with more capabilities:

```javascript
const window = new BrowserWindow({
  parent: mainWindow,          // Modal to main window
  modal: false,                // Non-blocking
  alwaysOnTop: true,
  frame: false,
  transparent: true,
  show: false,
  width: 400,
  height: 500,
  webPreferences: {
    preload: path.join(__dirname, 'chatModalPreload.js'),
    contextIsolation: true,
    nodeIntegration: false,
  },
});
```

**2. ChatModalManager** (`app/chatModal/index.js`)

Manages modal lifecycle and coordinates with Graph API:

```javascript
class ChatModalManager {
  #mainWindow;
  #chatModal;
  #graphApiClient;

  constructor(config, mainWindow, graphApiClient) {
    this.#mainWindow = mainWindow;
    this.#graphApiClient = graphApiClient;
  }

  initialize() {
    // IPC handlers for showing modal, searching users, sending messages
    ipcMain.on('chat-modal:show', this.#handleShowModal.bind(this));
    ipcMain.handle('chat-modal:search-users', this.#handleSearchUsers.bind(this));
    ipcMain.handle('chat-modal:get-recent-messages', this.#handleGetRecentMessages.bind(this));
    ipcMain.handle('chat-modal:send-message', this.#handleSendMessage.bind(this));
  }

  async #handleSearchUsers(event, query) {
    // Call Graph API to search users
    return await this.#graphApiClient.searchUsers(query);
  }

  async #handleGetRecentMessages(event, chatId) {
    // Call Graph API to get last 3 messages
    return await this.#graphApiClient.getChatMessages(chatId, { top: 3 });
  }

  async #handleSendMessage(event, chatId, content) {
    // Call Graph API to send message
    return await this.#graphApiClient.sendChatMessage(chatId, content);
  }
}
```

**3. Graph API Extensions** (`app/graphApi/index.js`)

Add chat-related methods:

```javascript
class GraphApiClient {
  // ... existing methods ...

  /** Search users by display name or email */
  async searchUsers(query) {
    const filter = `startswith(displayName, '${query}') or startswith(userPrincipalName, '${query}')`;
    return await this.makeRequest(`/users?$filter=${encodeURIComponent(filter)}&$select=id,displayName,userPrincipalName,mail&$top=10`);
  }

  /** Get user's chats */
  async getChats(options = {}) {
    const queryString = this._buildODataQuery(options);
    const endpoint = queryString ? `/me/chats?${queryString}` : '/me/chats';
    return await this.makeRequest(endpoint);
  }

  /** Get messages from a specific chat */
  async getChatMessages(chatId, options = {}) {
    const queryString = this._buildODataQuery(options);
    const endpoint = queryString
      ? `/chats/${chatId}/messages?${queryString}`
      : `/chats/${chatId}/messages`;
    return await this.makeRequest(endpoint);
  }

  /** Send a message to a chat */
  async sendChatMessage(chatId, content) {
    return await this.makeRequest(`/chats/${chatId}/messages`, {
      method: 'POST',
      body: {
        body: {
          content: content
        }
      }
    });
  }

  /** Get chat by searching for 1:1 chat with specific user */
  async getChatWithUser(userId) {
    // First get all chats, then filter for 1:1 with this user
    const chatsResult = await this.getChats({
      filter: `chatType eq 'oneOnOne'`,
      expand: 'members'
    });

    if (!chatsResult.success) return chatsResult;

    // Find chat containing the target user
    const chat = chatsResult.data?.value?.find(c =>
      c.members?.some(m => m.userId === userId)
    );

    return {
      success: true,
      data: chat || null
    };
  }
}
```

**4. UI Implementation** (`app/chatModal/chatModal.html`)

HTML/CSS for the modal interface:

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Quick Chat</title>
    <style>
        /* Modern Teams-like styling */
        body {
            font-family: 'Segoe UI', sans-serif;
            background: #292929;
            color: #fff;
            padding: 16px;
            margin: 0;
            border-radius: 8px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.6);
        }

        .search-box {
            width: 100%;
            padding: 12px;
            background: #3a3a3a;
            border: none;
            border-radius: 4px;
            color: #fff;
            font-size: 14px;
            margin-bottom: 12px;
        }

        .message-list {
            max-height: 300px;
            overflow-y: auto;
            margin-bottom: 12px;
            padding: 8px;
            background: #242424;
            border-radius: 4px;
        }

        .message {
            padding: 8px;
            margin: 4px 0;
            border-radius: 4px;
            background: #333;
            font-size: 13px;
        }

        .message-input {
            width: 100%;
            padding: 12px;
            background: #3a3a3a;
            border: none;
            border-radius: 4px;
            color: #fff;
            font-size: 14px;
            resize: vertical;
            min-height: 60px;
        }

        .send-button {
            margin-top: 8px;
            width: 100%;
            padding: 10px;
            background: #6264a7;
            border: none;
            border-radius: 4px;
            color: #fff;
            font-size: 14px;
            cursor: pointer;
            font-weight: 600;
        }

        .send-button:hover {
            background: #5558a3;
        }

        .send-button:disabled {
            background: #555;
            cursor: not-allowed;
        }
    </style>
</head>
<body>
    <h3 style="margin: 0 0 12px 0; font-size: 16px;">Quick Chat</h3>

    <input
        type="text"
        id="search"
        class="search-box"
        placeholder="Search for a person..."
    />

    <div id="user-results" class="user-list"></div>

    <div id="message-container" style="display: none;">
        <h4 id="chat-with" style="font-size: 14px; margin: 8px 0;"></h4>
        <div id="messages" class="message-list"></div>

        <textarea
            id="message-input"
            class="message-input"
            placeholder="Type a message..."
        ></textarea>

        <button id="send-btn" class="send-button">Send</button>
    </div>

    <script src="chatModal.js"></script>
</body>
</html>
```

#### User Flow

1. User triggers modal (keyboard shortcut or menu item)
2. Modal appears with search box
3. User types person's name
4. Shows search results
5. User selects person
6. Shows last 3 messages with that person (if any)
7. User types message and clicks send
8. Message sent via Graph API
9. Modal updates with sent message

#### IPC Channels to Add

```javascript
// app/security/ipcValidator.js - Add to allowedChannels:
'chat-modal:show',
'chat-modal:hide',
'chat-modal:search-users',
'chat-modal:get-chat-with-user',
'chat-modal:get-recent-messages',
'chat-modal:send-message'
```

### Phase 2: Enhanced Message Display

**Goal:** Improve message display and add message formatting.

**Enhancements:**

- Display message timestamps
- Show sender names (you vs. other person)
- Support basic markdown/HTML in message content
- Add message status (sending, sent, failed)
- Show typing indicators (if available via Graph API)

**Graph API Considerations:**

- Messages have rich content with HTML formatting
- May need to sanitize and render HTML safely
- Consider using existing Teams message rendering if possible

### Phase 3: Notifications Panel Evolution

**Goal:** Transform modal into a notifications/quick actions panel.

**Features:**

- Show unread messages from all chats (with counts)
- Allow replying to messages inline
- Mark messages as read
- Archive or mute conversations
- Quick access to recent conversations
- Integration with existing tray icon badge count

**Architecture Changes:**

- Make modal persistent (don't close after send)
- Add tabs or sections (Chats, Mentions, Activity)
- Sync state with main Teams window to avoid duplicates
- Consider WebSocket or polling for real-time updates

**Challenges:**

- Real-time updates require either polling or webhooks
- Graph API change notifications have complexity
- May need to coordinate with Teams web app's own state

## Implementation Considerations

### Advantages

✅ **Builds on existing patterns:**
- NotificationToast provides proven overlay window pattern
- GraphApiClient already handles authentication
- Follows established IPC validation practices

✅ **Lower complexity than multi-window:**
- Single modal, not multiple independent windows
- Clear parent-child relationship
- Simpler state management

✅ **Valuable standalone feature:**
- Quick chat access without navigation
- Doesn't require full multi-window support
- Can evolve incrementally

✅ **Uses official APIs:**
- Microsoft Graph API is stable and supported
- Delegated permissions already in use
- Same auth tokens as other Graph features

### Challenges

⚠️ **Graph API Limitations:**
- Rate limiting may affect rapid message sending
- Not suitable for real-time chat (need polling)
- Requires internet connectivity (no offline mode)
- Permissions must be granted by user

⚠️ **Chat Discovery:**
- Need to find or create 1:1 chat with user
- May require additional API calls
- First message to new contact creates chat

⚠️ **Synchronization:**
- Messages sent via modal won't immediately appear in Teams web UI
- Need to consider how to coordinate state
- May cause confusion if not clearly communicated

⚠️ **UI/UX Complexity:**
- Modal can become complex quickly
- Need clear visual design
- Handle errors gracefully (no connection, API failures)
- Loading states for async operations

### Estimated Effort

**Phase 1 (Basic Modal):** Medium

- ~500 lines of new code
- 3-5 files (ChatModal, ChatModalManager, UI, preload, CSS)
- Graph API extensions: 100-150 lines
- Testing and refinement
- Documentation

**Phase 2 (Enhanced Display):** Low

- Primarily UI improvements
- Message rendering and formatting
- ~200 lines additional code

**Phase 3 (Notifications Panel):** High

- Significant feature expansion
- Real-time updates mechanism
- State synchronization complexity
- ~800+ lines of additional code
- Extensive testing required

## Alternatives Considered

### Option 1: Use Teams Web Chat Directly

Embed Teams web chat UI in modal using webview or iframe.

**Pros:**
- Native Teams UI and behavior
- No need to replicate functionality
- Full feature parity

**Cons:**
- Requires authentication/session management
- May conflict with main window session
- Teams web UI not designed for embedding
- High risk of breaking with Teams updates
- Security concerns with shared sessions

**Why rejected:** Too complex and fragile, likely to break frequently.

### Option 2: Deep Link to Teams Web

Instead of modal, open chat in external browser or new Teams window.

**Pros:**
- No implementation needed
- Uses native Teams functionality
- No API limitations

**Cons:**
- Not an integrated experience
- Requires browser or new window
- Doesn't solve original problem (quick access)

**Why rejected:** Doesn't meet user needs for quick, integrated access.

### Option 3: Build Full Chat Client

Implement complete chat client with message history, real-time updates, rich formatting.

**Pros:**
- Full control over features
- Rich user experience
- No API limitations (once data loaded)

**Cons:**
- Very high implementation effort
- Requires real-time update mechanism
- Complex state synchronization
- Essentially duplicating Teams functionality

**Why rejected:** Scope too large, duplicates existing functionality, high maintenance burden.

## Recommendations (Updated 2025-01-31)

### Revised Approach: Quick Chat Access via Deep Links

The original Graph API-based approach is blocked. The recommended implementation uses:

**Working Components:**
- People API (`/me/people`) - Search contacts by relevance
- Deep links (`/l/chat/0/0?users=email`) - Navigate to chat in Teams

**Implementation Order:**

1. Add People API method to GraphApiClient (`searchPeople`)
2. Create QuickChatModal with user search UI
3. On user selection, navigate via deep link (`openChatWithUser`)
4. Add keyboard shortcut to show modal
5. Optionally: enhance notification clicks to open chat with sender

**Scope (Simplified):**
- Search for contacts
- Click to open chat (navigates Teams, no inline messaging)
- No message history display (API blocked)
- No inline message sending (API blocked)

### Future Enhancements

If users request more functionality:
- Cache recent contacts for faster access
- Add "favorites" list
- Improve deep link navigation (reduce page refresh)
- Consider notification reply integration (if API access changes)

## Related

- Issue [#1984](https://github.com/IsmaelMartinez/teams-for-linux/issues/1984) - Multiple windows request (catalyst for this investigation)
- [ADR 010](../adr/010-multiple-windows-support.md) - Multiple windows support decision
- `app/notificationSystem/` - Notification toast pattern to build upon
- `app/graphApi/` - Graph API integration foundation
- Microsoft Graph API permissions in configuration

## References

### Microsoft Graph API Documentation

- [Working with Teams messaging APIs](https://learn.microsoft.com/en-us/graph/teams-messaging-overview)
- [Send message in a chat](https://learn.microsoft.com/en-us/graph/api/chat-post-messages?view=graph-rest-1.0)
- [List messages in a chat](https://learn.microsoft.com/en-us/graph/api/chat-list-messages?view=graph-rest-1.0)
- [Send chatMessage in channel or chat](https://learn.microsoft.com/en-us/graph/api/chatmessage-post?view=graph-rest-1.0)
- [Get chatMessage in channel or chat](https://learn.microsoft.com/en-us/graph/api/chatmessage-get?view=graph-rest-1.0)
- [Use Microsoft Graph API with Teams](https://learn.microsoft.com/en-us/graph/api/resources/teams-api-overview?view=graph-rest-1.0)

### Implementation Examples

- Notification toast implementation: `app/notificationSystem/NotificationToast.js`
- Graph API client: `app/graphApi/index.js`
- IPC validation: `app/security/ipcValidator.js`

## Open Questions

1. **Chat discovery:** If searching for a user who you've never chatted with, how do we create or find the 1:1 chat? (Answer: Graph API automatically creates chat on first message)

2. **Rate limiting:** What are the actual rate limits for Graph API chat endpoints in practice?

3. **Real-time updates:** Is polling acceptable or do we need webhooks/change notifications for Phase 3?

4. **Permissions:** Do users need to explicitly grant Chat.ReadWrite permissions, or are they included in Teams authentication?

5. **Error handling:** How do we handle network failures, API errors, or missing permissions gracefully?

6. **UI position:** Bottom-right like notification toast, or center/side panel? Configurable?

7. **Keyboard shortcuts:** What shortcut should trigger the modal? Ctrl+Shift+C? Configurable?
