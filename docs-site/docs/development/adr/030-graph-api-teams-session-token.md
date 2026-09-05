---
id: 030-graph-api-teams-session-token
---

# ADR 030: Graph API Access via the Teams Session Token

## Status

✅ Implemented (v2.6.17; first consumer Quick Chat in v2.7.4)

## Context

Issue [#1832](https://github.com/IsmaelMartinez/teams-for-linux/issues/1832) asked for Teams for
Linux to reach Microsoft Graph: the user's calendar, mail, profile, and presence, so features could
be built on top of data the Teams web app already has access to but never surfaces through its own
UI in a form the wrapper can consume.

A wrapper around a web app has exactly two routes to a Graph token. It can register its own Azure AD
application, run its own OAuth/MSAL flow, and ask every tenant admin to consent to a second
application touching the same mailbox and calendar. Or it can reuse the token the embedded Teams web
app already holds, the one it uses for its own Graph calls, without asking for anything new.

The first Quick Chat features (ADR [014](014-quick-chat-deep-link-approach.md) and
[015](015-quick-chat-inline-messaging.md)) needed exactly this: People API search and, later, message
sending, and became the proving ground for whichever route this decision picked.

## Decision

Reuse the token Teams web already holds.

`reactHandler.acquireToken()` (`app/browser/tools/reactHandler.js`) walks Teams' own React service
tree to `authenticationService._coreAuthService._authProvider` and calls its `acquireToken()` for the
`https://graph.microsoft.com` resource, the same call Teams' own UI makes for its own Graph requests.
No separate consent screen appears because no separate application exists.

`GraphApiClient` (`app/graphApi/index.js`) caches the returned token in memory and requires a 5-minute
buffer before its recorded expiry before reusing it; inside that buffer it acquires a fresh one rather
than risk a request expiring mid-flight. The client exposes one method per supported Graph endpoint —
profile, calendar (read, create, update, delete), mail, and People API search — plus a chat
resolve/send pair for Quick Chat. Only seven of those methods are wired to an IPC channel;
`updateCalendarEvent` and `deleteCalendarEvent` exist on the client but neither has one yet. Chat
resolution is the one deliberate exception to "Graph token in, Graph response out": before
`sendChatMessage` can call `POST /chats/{id}/messages`, `resolveConversation()` calls Teams' internal
`entityCommanding.chat.chatWithUsers()` and scans the DOM for candidate thread IDs, because no Graph
endpoint can find or create a 1:1 chat by user ID. ADR-015 records why that exception exists.

The renderer never sees a token. `app/graphApi/ipcHandlers.js` exposes exactly seven `ipcMain.handle`
channels, each returning a parsed response rather than raw credentials, and all seven are the only
Graph API entries in the `app/security/ipcValidator.js` allowlist. The entire surface sits behind
`graphApi.enabled` (default `false`); when it is off, `graphApiClient` is never constructed and every
handler short-circuits to an explicit "not enabled" error.

## Consequences

### Positive

- No app registration, no admin consent flow, and no client secret to protect. The feature works the
  moment a user flips `graphApi.enabled`, on any tenant, because it rides the grant Teams already has.
- One code path (`reactHandler.acquireToken`) services every consumer; Quick Chat and the MQTT
  `get-calendar` command share it rather than each managing their own auth.

### Negative

- Scopes are capped at whatever Teams web itself requested. `/me`, calendar, mail, and People API work
  because Teams' own UI uses them; `/me/presence` returns 403 because `Presence.Read` was never among
  those scopes, and there is no way to request it without Teams itself changing what it asks for.
- The token path depends on Teams' internal React service names
  (`_getTeams2CoreServices`, `_coreAuthService`, `_authProvider`). Microsoft can rename or restructure
  these without notice; when that happens `acquireToken` returns a clear error rather than a token,
  degrading gracefully instead of crashing, but the feature stops working until the traversal is
  updated.
- No automated test coverage is possible. Acquiring a token requires a live, signed-in Teams session,
  so verification is manual, tenant by tenant, the same constraint ADR-009 already documents for the
  app generally.

## Alternatives Considered

### Custom Azure App Registration

A separate Azure AD application with its own MSAL flow, giving each tenant's administrators a Graph
identity they control independently of the browser session Teams itself uses.

PR [#2845](https://github.com/IsmaelMartinez/teams-for-linux/pull/2845) is open, awaiting the
contributor's reply. It attempts exactly this, to solve a different problem: avoiding forced daily
re-authentication under a Conditional Access sign-in frequency policy. The maintainer's review found
the design could not yet deliver what it promised: the MSAL result was assigned and only
null-checked, so nothing it returned ever reached the Electron session; the interactive flow appeared
to work only because it opened a normal login window on the shared session partition, which would
have authenticated the session regardless of the app registration; and the silent flow returned
before any window opened, so from the second launch onward the session received nothing at all. In
the same review comment, the maintainer suggested Intune SSO
([ADR-012](012-intune-sso-broker-compatibility.md)) as a possibly simpler fit instead: on an
Entra-joined machine with `microsoft-identity-broker` running, `auth.intune.enabled` uses the
device's existing Primary Refresh Token, with no app registration and no admin action needed. That
review is independent evidence that a second, app-registration-backed identity may not be necessary
for the class of problem it looks like it should solve, though it would not remove the Presence scope
gap either way, since Presence.Read still needs its own admin consent regardless of which application
asks for it.

### Teams' Undocumented Internal APIs

Reach further into Teams' internals than the Graph token plus the chat-resolve exception above — for
example sending messages through the IC3 chat service directly, or reading presence from an internal
service instead of accepting the `Presence.Read` scope gap. ADR-015 explored the IC3 route for message
sending and found the endpoint accepted messages that never reached the recipient, likely missing
worker/trouter state unavailable outside Teams' own renderer context. Going further trades a
documented Microsoft Graph API for an undocumented one with a worse reliability track record and no
public contract at all; the Graph token this ADR reuses, plus the one DOM-scanning exception already
made for chat resolution, is as far into Teams' internals as this integration goes.

## Related

- [ADR-012](012-intune-sso-broker-compatibility.md) — Intune SSO broker compatibility
- [ADR-014](014-quick-chat-deep-link-approach.md) — Quick Chat deep link approach
- [ADR-015](015-quick-chat-inline-messaging.md) — Quick Chat inline messaging
- Issue [#1832](https://github.com/IsmaelMartinez/teams-for-linux/issues/1832) — original request
- PR [#1958](https://github.com/IsmaelMartinez/teams-for-linux/pull/1958) — Phase 1 implementation
- PR [#2119](https://github.com/IsmaelMartinez/teams-for-linux/pull/2119) — Quick Chat inline-messaging
  consumer (ADR-015)
- PR [#2845](https://github.com/IsmaelMartinez/teams-for-linux/pull/2845) — open, awaiting the
  contributor's reply to the maintainer's review of the app-registration alternative
- Implementation reference: `app/graphApi/README.md`
