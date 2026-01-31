# Chat Modal Spike Results

**Related:** [Chat Modal Spikes and Gaps](chat-modal-spikes-and-gaps.md) | [Chat Modal Investigation](chat-modal-investigation.md)
**Date:** 2025-01-31
**Status:** BLOCKED - Feature Not Feasible

## How to Run Spikes

### Prerequisites

1. **Enable Graph API** in your config file (`~/.config/teams-for-linux/config.json`):

```json
{
  "graphApi": {
    "enabled": true
  }
}
```

2. **Launch Teams for Linux** and sign in to your Microsoft account
3. **Open DevTools** (Ctrl+Shift+I or View > Toggle Developer Tools)

### Running All Spikes

From the DevTools console, run:

```javascript
const results = await window.electronAPI.graphApi.runChatSpikes();
console.table(results);
```

The spikes will run automatically and log progress to both the console and the electron-log file.

### Understanding Results

The spike runner returns a comprehensive results object:

```javascript
{
  spike1_chatPermissions: { /* ... */ },
  spike2_chatDiscovery: { /* ... */ },
  spike3_firstMessage: { /* ... */ },
  spike4_userSearch: { /* ... */ },
  spike5_messageFormat: { /* ... */ },
  spike6_rateLimits: { /* ... */ },
  overallResult: {
    status: 'GO' | 'CONDITIONAL_GO' | 'BLOCKED',
    canProceed: boolean,
    criticalBlockers: [],
    warnings: [],
    successes: [],
    recommendation: string
  }
}
```

## Spike Details

### Spike 1: Chat Permissions (CRITICAL)

**Test:** `GET /me/chats?$top=1`

**Expected Results:**
- `200 OK` = Chat.Read permission available, proceed with spikes
- `403 Forbidden` = **BLOCKER** - Chat permissions not in Teams token scope

**If Blocked:**
The entire chat modal feature cannot be implemented as designed. Consider alternatives:
- Teams deep links (opens chat in browser/Teams)
- Read-only notification panel (if Presence.Read works instead)

### Spike 2: Chat Discovery

**Test:** `GET /me/chats?$expand=members&$top=10`

**Expected Results:**
- Returns list of user's chats
- Can filter by `chatType: 'oneOnOne'` or `chatType: 'group'`
- Members are expanded with `displayName`, `userId`, and `email`

**Key Questions Answered:**
- Can we find 1:1 chats? (Required for quick messaging)
- What does the member structure look like? (Required for recipient display)

### Spike 3: First-Time Message Flow

**Test:** `POST /chats` with empty members (validation test only)

**Expected Results:**
- `400 Bad Request` = Endpoint accessible, can create new chats
- `403 Forbidden` = Cannot create new chats, limited to existing conversations

**Impact:**
If chat creation is not possible, the modal can only message users you've already chatted with.

### Spike 4: User Search

**Tests:** Multiple search patterns

| Method | Endpoint | Notes |
|--------|----------|-------|
| displayName_startswith | `/users?$filter=startswith(displayName,'Test')` | Basic filter |
| userPrincipalName_startswith | `/users?$filter=startswith(userPrincipalName,'test')` | Email-based |
| mail_startswith | `/users?$filter=startswith(mail,'test')` | Mail filter |
| search_query | `/users?$search="displayName:test"` | Requires ConsistencyLevel header |
| people_api | `/me/people?$search="test"` | Relevance-based, contacts first |

**Expected Results:**
At least one method should return 200 OK with search results.

**Recommendation:**
Use `/me/people` for relevance-based results (shows frequent contacts first).

### Spike 5: Message Format

**Test:** `GET /chats/{chatId}/messages?$top=5`

**Expected Results:**
- Messages contain `body.contentType` (text or html)
- May include attachments and mentions
- HTML content requires sanitization before rendering

**Key Data Points:**
- Content types in use (text vs html)
- Presence of attachments or mentions
- Message format for UI rendering

### Spike 6: Rate Limits

**Test:** 10 rapid sequential requests to `/me/chats?$top=1`

**Expected Results:**
- `429 Too Many Requests` = Rate limiting active
- All `200 OK` = No rate limiting for this request volume

**Recommendation:**
If rate limiting detected, implement request throttling in the chat modal.

## Interpreting Overall Results

### Status: GO

All critical spikes passed. Proceed with chat modal implementation.

### Status: CONDITIONAL_GO

Some non-critical issues found (warnings). Proceed with implementation but:
- Address warnings in design
- May need to reduce feature scope
- Document limitations

### Status: BLOCKED

Critical blocker detected (typically Spike 1 failing with 403).

**Do NOT proceed with implementation.** Consider alternatives:
1. **Teams Deep Links:** Generate `msteams://` or web URLs that open chat in Teams
2. **Read-Only Panel:** If any read permissions work, build notification viewer without send
3. **Wait for Microsoft:** If permissions may be added in future Teams versions

## Actual Spike Results

**Date Run:** 2025-01-31
**Environment:** Production tenant
**Teams Version:** v2.7.2

### Spike 1: Chat Permissions
- **Status:** FAIL (CRITICAL BLOCKER)
- **Response Code:** 403 Forbidden
- **Error Message:** "Missing scope permissions on the request. API requires one of 'Chat.Read, Chat.ReadBasic, Chat.ReadWrite, ChatMessage.Read.All, Chat.ReadBasic.All, Chat.Read.All, Chat.ReadForTeam, TeamsTab.Create, User.ReadBasic.All'"
- **Notes:** The Teams token does not include any chat-related scopes. This is a fundamental limitation of the token that Teams provides to embedded applications.

### Spikes 2-6: Not Executed
- **Reason:** Spike 1 is a critical blocker - remaining spikes were skipped as they all depend on chat API access.

### Overall Assessment
- **Status:** BLOCKED
- **Recommendation:** DO NOT IMPLEMENT chat modal feature as designed. The Microsoft Graph Chat API is not accessible with the available token permissions.

## Conclusion

The chat modal feature **cannot be implemented** using the Microsoft Graph API approach. The Teams authentication token does not include the required `Chat.Read` or `Chat.ReadWrite` scopes.

This is consistent with how Microsoft has designed Teams permissions - chat functionality requires explicit consent that cannot be obtained through the embedded web app token.

## Alternatives to Consider

### Option A: Teams Deep Links (Recommended)
Instead of API-based chat, generate deep links that open chat in the main Teams interface:

```
https://teams.microsoft.com/l/chat/0/0?users=user@example.com
```

This provides quick access to chat without requiring API permissions.

### Option B: Read-Only Notification Panel
If `Presence.Read` permissions become available, build a read-only panel showing user presence/status and unread message counts (via existing tray icon logic), but no send capability.

### Option C: Close the Feature Request
Document the limitation and close Issue #2109 as "not feasible" with this technical explanation.

## Next Steps

Since the spikes returned BLOCKED status, the recommended action is to update the roadmap and close/defer the chat modal feature request with this technical explanation.

## Related Files

- **Spike Implementation:** `app/graphApi/chatSpikes.js`
- **IPC Handler:** `app/graphApi/ipcHandlers.js`
- **IPC Validation:** `app/security/ipcValidator.js`
