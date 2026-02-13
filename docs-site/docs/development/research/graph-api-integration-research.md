# Microsoft Graph API Integration Research

:::info Phase 1 Shipped
Graph API integration is in production since v2.7.4. Token acquisition, People API, and calendar/mail endpoints are used by Quick Chat Access (PR [#2119](https://github.com/IsmaelMartinez/teams-for-linux/pull/2119)). Phase 2+ features remain unstarted — awaiting user requests.
:::

**Issue**: [#1832](https://github.com/IsmaelMartinez/teams-for-linux/issues/1832)
**Status**: ✅ Phase 1 in production (v2.7.4) | Phase 2+ awaiting user feedback
**Date**: 2025-11-21

## Overview

This document tracks the research and implementation of Microsoft Graph API integration for Teams for Linux, enabling access to calendar, mail, presence, and user profile data using existing Teams authentication.

## Implementation Status

### Phase 1: POC Foundation (Complete)

- [x] Token acquisition via Teams React authentication provider
- [x] GraphApiClient module with core functionality
- [x] IPC handlers for renderer access
- [x] Configuration option (`graphApi.enabled`)
- [x] Security allowlist for IPC channels
- [x] Documentation generation support

### Phase 2: Enhanced Features (Not Started)

- [ ] Calendar sync with desktop notifications
- [ ] Presence status indicators
- [ ] Mail integration
- [ ] Error handling improvements
- [ ] Retry logic with exponential backoff

### Phase 3: User-Facing Features (Not Started)

- [ ] Calendar widget/panel
- [ ] Quick actions for meetings
- [ ] Mail preview notifications
- [ ] Settings UI for Graph API options

## Architecture

### Files Created

| File | Purpose |
|------|---------|
| `app/graphApi/index.js` | GraphApiClient class - token acquisition, API requests |
| `app/graphApi/ipcHandlers.js` | IPC handler registration for renderer access |

### Files Modified

| File | Changes |
|------|---------|
| `app/index.js` | Import and initialization of Graph API client |
| `app/config/index.js` | Added `graphApi` configuration option |
| `app/security/ipcValidator.js` | Added 5 Graph API channels to allowlist |
| `app/browser/tools/reactHandler.js` | Added `acquireToken()` method |
| `scripts/generateIpcDocs.js` | Added Microsoft Graph API category |

### IPC Channels

| Channel | Purpose |
|---------|---------|
| `graph-api-get-user-profile` | Get current user profile |
| `graph-api-get-calendar-events` | Get calendar events with OData options |
| `graph-api-get-calendar-view` | Get events within date range |
| `graph-api-create-calendar-event` | Create new calendar event |
| `graph-api-get-mail-messages` | Get mail messages with OData options |

## Technical Details

### Token Acquisition

The implementation leverages Teams' existing authentication infrastructure:

1. Teams loads with authenticated session
2. React component tree contains authentication provider
3. `reactHandler.acquireToken()` accesses this provider
4. Tokens are cached with 5-minute expiry buffer to avoid race conditions

```javascript
// Token acquisition flow
const authProvider = teams.authProvider;
const result = await authProvider.acquireToken('https://graph.microsoft.com', options);
```

### Request Flow

1. Renderer calls IPC handler (e.g., `graph-api-get-calendar-events`)
2. Handler checks if GraphApiClient is initialized
3. Client acquires token (from cache or fresh)
4. Client makes authenticated request to Graph API
5. Response is parsed and returned

### Configuration

```yaml
graphApi:
  enabled: true  # Default: false
```

## API Support

### Implemented Endpoints

- `GET /me` - User profile
- `GET /me/calendar/events` - Calendar events
- `GET /me/calendar/calendarView` - Calendar view with date range
- `POST /me/calendar/events` - Create event
- `PATCH /me/calendar/events/{id}` - Update event
- `DELETE /me/calendar/events/{id}` - Delete event
- `GET /me/messages` - Mail messages

### OData Support

All GET endpoints support OData query parameters:
- `$top` - Limit results
- `$select` - Select specific fields
- `$filter` - Filter results
- `$orderby` - Sort results
- `$skip` - Pagination offset
- `$expand` - Expand related entities

## Usage Example

```javascript
// From renderer process
const result = await ipcRenderer.invoke('graph-api-get-calendar-events', {
  top: 10,
  select: 'subject,start,end',
  orderby: 'start/dateTime'
});

if (result.success) {
  console.log(result.data.value); // Array of events
}
```

## Dependencies

- Relies on Teams web app being loaded and authenticated
- Requires `app/browser/tools/reactHandler.js` for token acquisition
- Uses native `fetch` API (Electron/Node.js)

## Testing

Manual testing required:
1. Enable Graph API in config
2. Launch app and sign in to Teams
3. Use DevTools console to invoke IPC handlers
4. Verify responses from Graph API

Automated E2E tests not feasible due to authentication requirement.

## Known Limitations

1. **Authentication dependency** - Requires Teams to be fully loaded and authenticated
2. **Token scope** - Limited to scopes granted to Teams web app
3. **Rate limiting** - Subject to Microsoft Graph API rate limits
4. **No offline support** - Requires network connectivity

### Endpoint Access Restrictions

The Teams web app token has limited scopes. Some endpoints return **403 Forbidden**:

| Endpoint | Status | Required Scope |
|----------|--------|----------------|
| `/me` | ✅ Works | `User.Read` |
| `/me/calendar/events` | ✅ Works | `Calendars.Read` |
| `/me/messages` | ✅ Works | `Mail.Read` |
| `/me/presence` | ❌ Forbidden | `Presence.Read` |

The presence endpoint requires explicit consent that the Teams web app doesn't have.

## Future Considerations

1. **Batch requests** - Use Graph API batching for multiple requests
2. **Delta queries** - Efficient sync using delta tokens
3. **Webhooks** - Real-time notifications for changes
4. **Additional endpoints** - OneDrive, Planner, To Do integration

## References

- [Microsoft Graph API Documentation](https://docs.microsoft.com/en-us/graph/)
- [Issue #1832](https://github.com/IsmaelMartinez/teams-for-linux/issues/1832)
- [Issue #1959 - Architecture Modernization](https://github.com/IsmaelMartinez/teams-for-linux/issues/1959)
