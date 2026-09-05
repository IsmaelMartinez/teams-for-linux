# Microsoft Graph API Integration

Teams for Linux reuses the Microsoft Graph token the embedded Teams web app already holds, instead of
registering its own Azure AD application. See
[ADR-030](../../docs-site/docs/development/adr/030-graph-api-teams-session-token.md) for why.

## Files

- `index.js`: `GraphApiClient` — token acquisition and caching, a generic `makeRequest` helper, and
  one method per supported Graph endpoint plus the Quick Chat chat resolve/send helpers.
- `ipcHandlers.js`: registers the IPC channels that expose `GraphApiClient` to the renderer.

## Configuration

```json
{
  "graphApi": {
    "enabled": false
  }
}
```

Disabled by default. When disabled, `graphApiClient` is never constructed and every IPC handler
short-circuits to `{ success: false, error: 'Graph API not enabled' }`.

## Token Acquisition

`GraphApiClient.acquireToken()` runs `window.teamsForLinuxReactHandler.acquireToken()` via
`executeJavaScript` on the main window's `webContents`. That function
(`app/browser/tools/reactHandler.js`) walks Teams' own React service tree —
`_getTeams2CoreServices().authenticationService._coreAuthService._authProvider` — and calls its
`acquireToken('https://graph.microsoft.com', ...)`, the same call Teams' own UI makes for its Graph
requests. The result is cached in memory and reused until it is within 5 minutes of its recorded
expiry, at which point a fresh token is acquired instead of risking a request expiring mid-flight. The
token is minted by Teams' own auth provider inside the renderer and read back into the main process
by that `executeJavaScript` call, where it is cached. It is never returned through the
renderer-facing IPC responses, which carry only `{ success, data }`.

## IPC Channels

All seven channels below are the complete Graph API allowlist entries in
`app/security/ipcValidator.js`.

| Channel | Type | Purpose |
|---------|------|---------|
| `graph-api-get-user-profile` | handle | Get the current user profile (`/me`) |
| `graph-api-get-calendar-events` | handle | List calendar events with OData options |
| `graph-api-get-calendar-view` | handle | List events in a date range (`/me/calendar/calendarView`) |
| `graph-api-create-calendar-event` | handle | Create a calendar event |
| `graph-api-get-mail-messages` | handle | List mail messages with OData options |
| `graph-api-search-people` | handle | People API search (Quick Chat contact search) |
| `graph-api-send-chat-message` | handle | Resolve a 1:1 chat and send a message (Quick Chat) |

`GraphApiClient` also implements `updateCalendarEvent` and `deleteCalendarEvent`, but neither is
currently wired to an IPC channel.

## Endpoints Implemented

- `GET /me`
- `GET /me/calendar/events`, `POST /me/calendar/events`, `PATCH` / `DELETE .../{id}` (the latter two
  have no IPC channel yet, see above)
- `GET /me/calendar/calendarView`
- `GET /me/messages`
- `GET /me/people` (search)
- `GET /chats/{id}/members`, `POST /chats/{id}/messages` — used by `resolveConversation` /
  `sendChatMessage` for Quick Chat inline messaging (see
  [ADR-015](../../docs-site/docs/development/adr/015-quick-chat-inline-messaging.md))

## OData Query Support

`_buildODataQuery()` maps a plain options object onto Graph query parameters: `top` → `$top`,
`select` → `$select`, `filter` → `$filter`, `orderby` → `$orderby`, `skip` → `$skip`, `count` →
`$count`, `search` → `$search`, `expand` → `$expand`. `startDateTime` and `endDateTime` pass through
unprefixed for `calendarView`.

## Manual Testing

Automated coverage is not possible: acquiring a token requires a live, signed-in Teams session, so
this stays a manual check.

1. Set `graphApi.enabled: true` in `config.json`.
2. Launch the app and wait for Teams to load fully authenticated.
3. Open DevTools and invoke a handler directly, e.g.
   `await require('electron').ipcRenderer.invoke('graph-api-get-user-profile')`.
4. Confirm the response and check the application logs for `[GRAPH_API]` lines.

## Limitations

Scopes are capped at whatever Teams web itself was granted — there is no way to request a broader
scope without Teams itself asking for it:

| Endpoint | Status | Required scope |
|----------|--------|-----------------|
| `/me` | ✅ Works | `User.Read` |
| `/me/calendar/*` | ✅ Works | `Calendars.Read` (`Calendars.ReadWrite` for create) |
| `/me/messages` | ✅ Works | `Mail.Read` |
| `/me/people` | ✅ Works | `People.Read` |
| `/chats/{id}/members`, `/chats/{id}/messages` | ✅ Works | `ChatMember.Read`, `ChatMessage.Send` |
| `/me/presence` | ❌ 403 Forbidden | `Presence.Read` (not granted to the Teams web client) |

The token path also depends on Teams' internal React service names, which Microsoft can change
without notice; when that happens `acquireToken` returns an explicit error rather than a token.

## Not Implemented

Earlier research for this integration scoped a longer backlog that never got built: presence
indicators (blocked on the `Presence.Read` scope above), retry with exponential backoff, calendar
sync with desktop notifications, a calendar widget with meeting quick actions, mail preview
notifications, a settings UI for Graph API options, and batch requests, delta queries, and webhooks.
`updateCalendarEvent` and `deleteCalendarEvent` also exist on `GraphApiClient` already, but neither
has an IPC channel wired up in `ipcHandlers.js` (see IPC Channels above).

## Consumers

- Quick Chat modal — People API search and inline messaging
  ([ADR-014](../../docs-site/docs/development/adr/014-quick-chat-deep-link-approach.md),
  [ADR-015](../../docs-site/docs/development/adr/015-quick-chat-inline-messaging.md))
- MQTT `get-calendar` command, which publishes `getCalendarView()` results to the `teams/calendar`
  topic (see [MQTT integration](../../docs-site/docs/mqtt-integration.md))

## Related

- [ADR-030](../../docs-site/docs/development/adr/030-graph-api-teams-session-token.md) — decision to
  reuse the Teams session token instead of a custom Azure app registration
- Issue [#1832](https://github.com/IsmaelMartinez/teams-for-linux/issues/1832)
- PR [#1958](https://github.com/IsmaelMartinez/teams-for-linux/pull/1958) — Phase 1 implementation
- PR [#2119](https://github.com/IsmaelMartinez/teams-for-linux/pull/2119) — Quick Chat inline-messaging
  consumer (ADR-015)
