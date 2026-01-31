# Chat Modal: Prerequisite Spikes and Gap Analysis

**Related:** [Chat Modal Investigation](chat-modal-investigation.md) | [Spike Results](chat-modal-spike-results.md)
**Date:** 2025-11-26
**Updated:** 2025-01-31
**Status:** BLOCKED - Feature Not Feasible

## Executive Summary

The validation spikes have been executed and **confirmed a critical blocker**: the Teams token does not include `Chat.Read` or `Chat.ReadWrite` permissions. The chat modal feature cannot be implemented as designed.

See [Spike Results](chat-modal-spike-results.md) for full details and alternative approaches.

## Critical Blockers Requiring Validation

### 🚨 BLOCKER 1: Chat API Permissions

**Status:** ❌ CONFIRMED BLOCKER (403 Forbidden)

**Problem:**
The existing Graph API integration (Issue #1832) successfully uses:
- ✅ `User.Read` - Works
- ✅ `Calendars.Read` - Works
- ✅ `Mail.Read` - Works
- ❌ `Presence.Read` - **403 Forbidden** (not in Teams token scope)

**However:** Chat permissions (`Chat.Read`, `Chat.ReadWrite`) have **never been tested**.

**Risk:** High - The entire chat modal depends on these permissions being available.

**Validation Required:**

```javascript
// Spike 1.1: Test chat permissions
// File: spike-chat-permissions.js

async function testChatPermissions() {
  try {
    // Attempt to list user's chats
    const chatsResult = await graphApiClient.makeRequest('/me/chats');

    if (chatsResult.success) {
      console.log('✅ Chat.Read scope available');
      console.log('Chat count:', chatsResult.data?.value?.length);
    } else if (chatsResult.status === 403) {
      console.error('❌ Chat.Read scope NOT available - BLOCKER');
      console.error('Teams token does not include chat permissions');
    }
  } catch (error) {
    console.error('❌ Chat API test failed:', error);
  }
}
```

**Expected Outcomes:**
1. **Success:** Chat scopes are available → Proceed with implementation
2. **403 Forbidden:** Chat scopes NOT available → **Feature cannot be implemented** as designed
3. **Alternative:** May need to request additional consent or use different API approach

**Priority:** 🔴 **CRITICAL - MUST BE FIRST SPIKE**

---

### 🚨 BLOCKER 2: Chat Discovery for 1:1 Conversations

**Status:** ❌ UNVERIFIED

**Problem:**
When user searches for a person and wants to send them a message, we need to:
1. Find existing 1:1 chat with that person, OR
2. Create a new 1:1 chat if none exists

**Current Understanding:**
- Graph API documentation suggests chat is auto-created on first message
- However, the exact API flow is unclear
- Need to test: Can we send a message to a user we've never chatted with?

**Validation Required:**

```javascript
// Spike 2.1: Test chat discovery and creation
async function testChatDiscovery(userId) {
  // Option A: List all chats and filter
  const chatsResult = await graphApiClient.makeRequest('/me/chats');
  const oneOnOneChats = chatsResult.data?.value?.filter(c =>
    c.chatType === 'oneOnOne'
  );

  // Find chat with target user
  // TODO: How are members represented? Need to test response structure

  // Option B: Create chat directly?
  // const createResult = await graphApiClient.makeRequest('/chats', {
  //   method: 'POST',
  //   body: { chatType: 'oneOnOne', members: [...] }
  // });

  // Option C: Send message and let API create chat?
  // Need to test if this works without chatId
}
```

**Expected Outcomes:**
1. Identify correct API pattern for finding/creating 1:1 chats
2. Document member structure in chat responses
3. Determine if chat pre-creation is required or if first message creates it

**Priority:** 🔴 **CRITICAL - REQUIRED FOR BASIC FUNCTIONALITY**

---

### ⚠️ BLOCKER 3: Message Send Without Existing Chat

**Status:** ❌ UNVERIFIED

**Problem:**
If user searches for "John Doe" who they've never chatted with:
- Do we need to create the chat first?
- Can we send a message that auto-creates the chat?
- What's the chatId for a non-existent chat?

**Validation Required:**

```javascript
// Spike 3.1: Test first-time message sending
async function testFirstTimeMessage(targetUserId) {
  // Attempt 1: Try to get chatId from user search
  // Is there a /users/{userId}/chat endpoint?

  // Attempt 2: Try to send message with user mention?
  // Some APIs support @mentions that resolve to users

  // Attempt 3: Create chat explicitly first
  const chatResult = await graphApiClient.makeRequest('/chats', {
    method: 'POST',
    body: {
      chatType: 'oneOnOne',
      members: [
        { '@odata.type': '#microsoft.graph.aadUserConversationMember', 'user@odata.bind': `https://graph.microsoft.com/v1.0/users('${targetUserId}')` }
      ]
    }
  });

  if (chatResult.success) {
    const chatId = chatResult.data.id;
    // Then send message to this chatId
  }
}
```

**Expected Outcomes:**
1. Identify correct flow for first-time messages
2. Document whether chat creation is manual or automatic
3. Update chat modal design based on findings

**Priority:** 🟠 **HIGH - AFFECTS USER FLOW DESIGN**

---

## Additional Validation Spikes

### Spike 4: User Search API Validation

**Status:** ❌ UNVERIFIED

**Problem:**
The proposed design uses:
```javascript
GET /users?$filter=startswith(displayName, 'John')
```

However:
- Does this require `User.ReadBasic.All` or `User.Read.All` permission?
- Are these permissions available in Teams token?
- Does search work across entire organization or only contacts?

**Validation:**

```javascript
// Test user search with various filters
async function testUserSearch(query) {
  const filters = [
    `startswith(displayName, '${query}')`,
    `startswith(userPrincipalName, '${query}')`,
    `startswith(mail, '${query}')`
  ];

  for (const filter of filters) {
    const result = await graphApiClient.makeRequest(
      `/users?$filter=${encodeURIComponent(filter)}&$top=10`
    );

    console.log(`Filter "${filter}": ${result.success ? 'Works' : 'Fails'}`);
    if (!result.success) {
      console.log('Error:', result.status, result.error);
    }
  }
}
```

**Priority:** 🟠 **HIGH - REQUIRED FOR USER SEARCH**

---

### Spike 5: Message Format and Rich Content

**Status:** ❌ UNVERIFIED

**Problem:**
Teams messages support:
- Rich HTML formatting
- @mentions
- Emojis
- File attachments
- Adaptive cards

**Questions:**
- What format does Graph API return messages in?
- Can we safely render HTML from messages?
- How do we handle @mentions in the modal?
- What happens if message has attachments?

**Validation:**

```javascript
// Test message retrieval and format
async function testMessageFormats(chatId) {
  const result = await graphApiClient.makeRequest(
    `/chats/${chatId}/messages?$top=10`
  );

  if (result.success) {
    result.data.value.forEach(msg => {
      console.log('Message format:', {
        bodyType: msg.body?.contentType, // text, html?
        hasAttachments: msg.attachments?.length > 0,
        hasMentions: msg.mentions?.length > 0,
        body: msg.body?.content.substring(0, 100)
      });
    });
  }
}
```

**Priority:** 🟡 **MEDIUM - AFFECTS UI DESIGN**

---

### Spike 6: Rate Limiting and Performance

**Status:** ❌ UNVERIFIED

**Problem:**
Graph API has rate limits. We need to understand:
- What are the rate limits for chat endpoints?
- How many requests can we make per second/minute?
- What happens when rate limited (429 response)?

**Validation:**

```javascript
// Test rate limits by making rapid requests
async function testRateLimits() {
  const requests = [];
  for (let i = 0; i < 20; i++) {
    requests.push(graphApiClient.makeRequest('/me/chats'));
  }

  const results = await Promise.all(requests);
  const rateLimited = results.filter(r => r.status === 429);

  console.log('Rate limited requests:', rateLimited.length);
  if (rateLimited.length > 0) {
    console.log('Retry-After:', rateLimited[0].headers?.['retry-after']);
  }
}
```

**Priority:** 🟡 **MEDIUM - AFFECTS ERROR HANDLING**

---

### Spike 7: Modal Window Behavior

**Status:** ❌ UNTESTED

**Problem:**
Need to validate the modal window pattern works for chat:
- Position (center, side, bottom-right?)
- Size (400x500 sufficient for chat?)
- Keyboard navigation and focus
- Close behavior (click outside, ESC key?)
- Persistence (stays open during typing?)

**Validation:**

```javascript
// Create test modal to validate behavior
const testModal = new BrowserWindow({
  parent: mainWindow,
  modal: false,
  alwaysOnTop: true,
  frame: false,
  transparent: true,
  width: 400,
  height: 500,
  x: mainWindow.getBounds().x + mainWindow.getBounds().width - 420,
  y: mainWindow.getBounds().y + 80
});

// Test:
// - Can you type while modal is open?
// - Does it stay on top of other apps?
// - Does ESC close it?
// - Can you click main window while modal open?
```

**Priority:** 🟡 **MEDIUM - UX VALIDATION**

---

## Gap Analysis: Missing from Original Investigation

### Gap 1: Error Handling Scenarios

**Missing from original doc:**

| Scenario | Handling Strategy | Documented? |
|----------|------------------|-------------|
| No internet connection | Graceful error, suggest checking network | ❌ No |
| Token expired | Automatic refresh via ReactHandler | ✅ Mentioned |
| 403 Forbidden (no permission) | Clear message, disable feature | ❌ No |
| 404 Chat not found | Create chat or show error | ❌ No |
| 429 Rate limited | Retry with exponential backoff | ❌ No |
| User not found in search | Empty state message | ❌ No |
| Message send fails | Retry button, error feedback | ❌ No |
| Main window closes | Close modal gracefully | ❌ No |

**Recommendation:** Add comprehensive error handling section to implementation plan.

---

### Gap 2: Offline Behavior

**Missing from original doc:**

Current design requires internet for:
- User search (Graph API)
- Message history (Graph API)
- Sending messages (Graph API)

**Questions:**
- What happens if user opens modal when offline?
- Should we cache recent contacts?
- Show offline indicator?
- Disable modal when offline?

**Recommendation:** Define offline behavior strategy before implementation.

---

### Gap 3: Group Chats vs 1:1 Chats

**Missing from original doc:**

Current design assumes 1:1 chats only. However:
- Teams has group chats
- User might want to send quick message to a group
- API supports both `chatType: 'oneOnOne'` and `chatType: 'group'`

**Questions:**
- Should Phase 1 support group chats?
- How does user select between multiple chats with same person?
- How to display group chat membership?

**Recommendation:** Clarify chat type scope for Phase 1. Suggest 1:1 only for MVP.

---

### Gap 4: Message History Synchronization

**Missing from original doc:**

**Problem:**
Messages sent via modal won't immediately appear in Teams web UI because:
- Teams web app has its own state management
- No real-time sync between modal and main window
- May cause user confusion (sent message not visible in Teams)

**Scenarios:**
1. User sends message in modal → Not immediately visible in Teams chat list
2. User receives reply → Modal doesn't know (unless polling)
3. User opens same chat in Teams → May not see modal-sent message yet

**Recommendation:** Add clear UX messaging:
- "Message sent! It may take a moment to appear in Teams."
- Consider closing modal after send (forces user back to Teams)
- Or add "Open in Teams" button after send

---

### Gap 5: Security and Content Sanitization

**Missing from original doc:**

**Problem:**
Teams messages contain HTML that could include:
- Malicious scripts (XSS)
- Tracking pixels
- External images
- Iframes

**Questions:**
- How do we safely render HTML message content?
- Do we need HTML sanitization library?
- Should we render plain text only in Phase 1?
- How does Teams web app handle this?

**Recommendation:**
- Phase 1: Plain text only (use `body.contentType: 'text'`)
- Future: Add HTML sanitization library (DOMPurify or similar)

---

### Gap 6: Keyboard Shortcuts and Accessibility

**Missing from original doc:**

**Required for good UX:**
- Keyboard shortcut to open modal (Ctrl+Shift+C suggested, not documented)
- ESC to close modal
- Tab navigation through search results
- Enter to select user
- Ctrl+Enter to send message
- Screen reader compatibility

**Recommendation:** Define keyboard shortcuts and accessibility requirements before implementation.

---

### Gap 7: Configuration Options

**Missing from original doc:**

**Should be configurable:**
```yaml
chatModal:
  enabled: true           # Enable/disable feature
  shortcut: 'Ctrl+Shift+C'  # Keyboard shortcut
  position: 'bottom-right'  # Modal position
  messageHistoryCount: 3    # Number of messages to show
  autoCloseAfterSend: false # Close modal after sending
```

**Recommendation:** Add configuration section to design doc.

---

### Gap 8: Performance Considerations

**Missing from original doc:**

**Concerns:**
- How long does user search take? (Need loading indicator)
- How long to load message history? (Need skeleton UI)
- Does typing in search trigger API call on every keystroke? (Should debounce)
- How many API calls per modal open? (Should batch if possible)

**Recommendation:**
- Add debouncing to user search (300ms delay)
- Show loading states for all async operations
- Consider caching recent contacts locally

---

### Gap 9: Analytics and Telemetry

**Missing from original doc:**

**Useful metrics:**
- How often is modal opened?
- How many messages are sent via modal?
- What's the average time to send a message?
- How often do errors occur?
- Which errors are most common?

**Recommendation:** Add optional telemetry (with privacy considerations).

---

### Gap 10: Testing Strategy

**Missing from original doc:**

**Required tests:**
1. **Unit tests:** GraphApiClient chat methods
2. **Integration tests:** Modal window creation and positioning
3. **Manual test plan:** User flows and error scenarios
4. **Permission tests:** Verify chat scopes work
5. **Error injection tests:** Simulate network failures, API errors

**Note:** E2E tests not feasible due to authentication requirements (per existing Graph API research).

**Recommendation:** Create detailed manual test plan with all user scenarios.

---

## Recommended Spike Sequence

### Phase 0: Validation (Before Any Implementation)

**Duration:** 2-3 days

1. **Day 1 Morning:** 🚨 **CRITICAL SPIKE 1** - Test chat API permissions
   - Result A: Permissions available → Proceed
   - Result B: Permissions NOT available → **STOP, feature not viable**

2. **Day 1 Afternoon:** 🚨 **CRITICAL SPIKE 2** - Test chat discovery
   - Document API patterns for finding 1:1 chats
   - Test with existing chats

3. **Day 2 Morning:** ⚠️ **CRITICAL SPIKE 3** - Test first-time message sending
   - Test with user never chatted with before
   - Document chat creation flow

4. **Day 2 Afternoon:** **SPIKE 4** - Test user search API
   - Validate search works and permissions available
   - Test different search patterns

5. **Day 3 Morning:** **SPIKE 5** - Test message formats
   - Examine real message responses
   - Document HTML/text handling requirements

6. **Day 3 Afternoon:** **SPIKE 6 & 7** - Test rate limits and modal behavior
   - Understand API limits
   - Validate modal UX

### Decision Point

After Phase 0 spikes:
- ✅ **All critical spikes pass:** Proceed with implementation
- ❌ **Any critical spike fails:** Re-evaluate feature viability

---

## Spike Implementation

The spike test harness has been implemented and is ready to use.

### Implementation Files

- **Spike Runner:** `app/graphApi/chatSpikes.js` - Contains all 6 spike tests
- **IPC Handler:** `app/graphApi/ipcHandlers.js` - Exposes `graph-api-run-chat-spikes` channel
- **IPC Allowlist:** `app/security/ipcValidator.js` - Channel added to allowlist

### How to Run Spikes

See [Chat Modal Spike Results](chat-modal-spike-results.md) for detailed instructions.

**Quick Start:**

1. Enable Graph API in config:
   ```json
   { "graphApi": { "enabled": true } }
   ```

2. Launch app, sign in, open DevTools (Ctrl+Shift+I)

3. Run spikes from console:
   ```javascript
   const results = await window.electronAPI.invoke('graph-api-run-chat-spikes');
   console.table(results);
   ```

---

## Decision Matrix

| Spike Result | Action |
|--------------|--------|
| ✅ Chat permissions work | Proceed with implementation |
| ❌ Chat permissions 403 | **BLOCKER**: Feature cannot be implemented. Consider alternatives. |
| ✅ Chat discovery works | Use discovered API pattern in implementation |
| ❌ Chat discovery unclear | Research Microsoft documentation, may need to adjust design |
| ✅ First message works | Document flow in implementation guide |
| ❌ First message requires complex setup | Consider if complexity worth the feature |
| ✅ User search works | Proceed with search UI |
| ❌ User search requires different permission | May need to use different search approach (search recent chats only?) |

---

## Updated Recommendations

### Original Recommendation (from investigation doc):
> ✅ Implement Phase 1 (Basic Modal)

### Updated Recommendation (after gap analysis):
> ⚠️ **CONDITIONAL APPROVAL** - Implement Phase 1 **ONLY IF** critical validation spikes pass.
>
> **Before any implementation:**
> 1. Run critical spikes 1-3 (chat permissions, discovery, first message)
> 2. Document spike results in this file
> 3. Make GO/NO-GO decision based on results
> 4. If GO: Update implementation plan with spike findings

### Alternative if Spikes Fail

If chat API permissions are not available:

**Option A:** Request Additional Permissions
- Not feasible - we can't modify Teams web app permissions
- ❌ Not viable

**Option B:** Use Teams Deep Links Instead
- Instead of sending messages via API, generate Teams deep links
- Example: `https://teams.cloud.microsoft/l/chat/0/0?users=user@domain.com`
- Opens chat in Teams web app
- ⚠️ Less integrated but doesn't require API permissions

**Option C:** Focus on Read-Only Features
- If Chat.Read works but Chat.ReadWrite doesn't
- Build notification panel without send capability
- View messages and unread counts only
- ⚠️ Partial functionality but still useful

---

## Sources and References

### Microsoft Graph API Documentation
- [Working with Teams messaging APIs](https://learn.microsoft.com/en-us/graph/teams-messaging-overview)
- [Teams Tab application permissions](https://learn.microsoft.com/en-us/answers/questions/1189628/teams-tab-application-permission-delegated-version)
- [Microsoft Graph Permissions for Tab](https://learn.microsoft.com/en-us/microsoftteams/platform/tabs/how-to/authentication/tab-sso-graph-api)
- [Microsoft Teams / Graph API: All about Scopes](https://www.terrymatula.com/development/2020/microsoft-teams-graph-api-all-about-scopes/)

### Internal Documentation
- [Graph API Integration Research](graph-api-integration-research.md) - Shows current permissions
- [Chat Modal Investigation](chat-modal-investigation.md) - Original feature proposal
- [ADR 010: Multiple Windows Support](../adr/010-multiple-windows-support.md) - Context for chat modal

---

## Next Steps

1. **Immediate:** Review and approve this spike plan
2. **Week 1:** Execute critical validation spikes (1-3)
3. **Decision Point:** GO/NO-GO based on spike results
4. **Week 2+:** If GO, update implementation plan and begin Phase 1

---

## Appendix: Spike Test Checklist

### Spike 1: Chat Permissions
- [ ] Attempt to list chats: `GET /me/chats`
- [ ] Check response status (200 = success, 403 = no permission)
- [ ] Verify chat data structure if successful
- [ ] Document permission status in this file

### Spike 2: Chat Discovery
- [ ] List all user's chats
- [ ] Identify oneOnOne chats
- [ ] Examine member structure in response
- [ ] Test filtering by member userId
- [ ] Document API pattern

### Spike 3: First Message
- [ ] Find test user never chatted with
- [ ] Attempt to find existing chat (should not exist)
- [ ] Attempt to send message without existing chat
- [ ] Document if chat auto-created or error returned
- [ ] If error, test manual chat creation

### Spike 4: User Search
- [ ] Test `startswith` filter on displayName
- [ ] Test `startswith` filter on userPrincipalName
- [ ] Test `startswith` filter on mail
- [ ] Check permission requirements
- [ ] Document which filters work

### Spike 5: Message Format
- [ ] Retrieve messages from existing chat
- [ ] Examine `body.contentType` (text vs html)
- [ ] Check for attachments
- [ ] Check for mentions
- [ ] Document rendering requirements

### Spike 6: Rate Limits
- [ ] Make 20 rapid API requests
- [ ] Check for 429 responses
- [ ] Note Retry-After header if rate limited
- [ ] Document safe request frequency

### Spike 7: Modal Behavior
- [ ] Create test modal window
- [ ] Test positioning options
- [ ] Test keyboard interactions
- [ ] Test focus behavior
- [ ] Document UX findings
