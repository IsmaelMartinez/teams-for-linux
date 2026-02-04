# Teams Internal Messaging API Spike

Status: Complete
Date: 2026-02-04

## Goal

Discover how Teams sends chat messages internally, so we can later implement inline message sending from the Quick Chat modal without navigating away from meetings. The Graph API approach is blocked (403 Forbidden, token lacks Chat.ReadWrite scope).

## Key Findings

### Message-Sending Endpoint (Discovered)

Teams sends chat messages via a POST to its internal chat service (IC3):

```
POST https://teams.cloud.microsoft/api/chatsvc/{region}/v1/users/ME/conversations/{conversationId}/messages
```

The `{region}` is `emea` for EU users. The `{conversationId}` is the thread ID in the format `19:uni01_...@thread.v2`. The response is `201 Created` with a `Location` header containing the server-assigned message ID.

### Authentication

The Bearer token audience is `https://ic3.teams.office.com`, not `https://graph.microsoft.com`. This is why the Graph API approach returned 403 — the token scope (`Teams.AccessAsUser.All`) is specific to the IC3 service, not the Graph API.

The existing `reactHandler.acquireToken(resource)` method should be able to acquire this token if called with `https://ic3.teams.office.com` as the resource parameter.

### Request Body Structure

```json
{
  "id": "-1",
  "type": "Message",
  "clientmessageid": "{unique-client-id}",
  "composetime": "{ISO-8601-timestamp}",
  "content": "<p>{message text}</p>",
  "contenttype": "Text",
  "conversationLink": "{base-url}/{conversationId}",
  "conversationid": "{conversationId}",
  "from": "8:orgid:{user-aad-object-id}",
  "fromUserId": "8:orgid:{user-aad-object-id}",
  "imdisplayname": "{user display name}",
  "messagetype": "RichText/Html",
  "originalarrivaltime": "{ISO-8601-timestamp}",
  "properties": {
    "importance": "",
    "subject": "",
    "title": "",
    "cards": "[]",
    "links": "[]",
    "mentions": "[]",
    "onbehalfof": null
  },
  "amsreferences": [],
  "callId": "",
  "crossPostChannels": [],
  "state": 0,
  "version": "0"
}
```

Key observations about the payload: the `clientmessageid` is a unique client-generated ID (appears to be a snowflake/timestamp-based ID). The `from` and `fromUserId` use the Skype MRI format `8:orgid:{aad-object-id}`. Content is wrapped in HTML paragraph tags with `messagetype: "RichText/Html"`. The `id: "-1"` is a placeholder; the server assigns the real ID (returned in the Location header).

### Required Headers

```
authorization: Bearer {ic3-token}
content-type: application/json
behavioroverride: redirectAs404
clientinfo: os=mac; osVer=10.15.7; proc=x86; lcid=en-gb; deviceType=1; country=gb; clientName=skypeteams; clientVer=1415/26010400925; utcOffset=+00:00; timezone=Europe/London
x-ms-migration: True
x-ms-request-priority: 0
x-ms-test-user: False
```

The `clientinfo` header contains device metadata. The `behavioroverride: redirectAs404` header prevents redirect loops. The `x-ms-migration: True` header may be related to the IC3-to-new-chat-service migration.

### Architecture: CDL Web Worker Pattern

Teams does not send messages from the main window's JavaScript context. All data operations, including message sending, go through a Converged Data Layer (CDL) Web Worker architecture.

The flow is: React component -> Relay/GraphQL mutation -> postMessage to CDL Worker -> Worker's own fetch -> Teams backend.

This means monkey-patching `fetch`/`XMLHttpRequest`/`WebSocket` in the preload script (main window context) does not capture message-sending traffic. Workers have their own isolated global scope with separate network APIs. The message-sending request was confirmed to originate from a worker (referer: `precompiled-web-worker-58d836c160ab16a8.js`).

### Core Services Enumeration (96 services found)

The React root's `coreServices` object contains 96 services. The most relevant for messaging are listed below.

`client` — The data layer client. Has `_relayEnvironment`, `_relayLogger`, `_relayHandlers`, `createApolloClient`, and `viewSchemaClient`. This confirms Teams uses Relay (Facebook's GraphQL framework) for data operations, with Apollo as an alternative client.

`entityCommanding` — Has 57 entity command categories including `chat`, `call`, `channel`, `deepLink`, and `search`. The `entityCommanding.chat` property is the command dispatch interface for chat operations.

`gtmRegistry` — Has `chatService` and `chatServiceBind` method. Wires up service endpoint bindings for chat operations.

`cdlWorkerService` — The Converged Data Layer worker manager. Has `getDataLayerClient`, `getControlPlaneCommunicator`, and `injectAuthStateProvider`. The bridge between the main thread and the data workers.

`authenticationService` — 54 methods including `acquireToken`, `acquireTokenV2`. Manages token acquisition for various resources.

`discover` — Service discovery. Has `observeSkypeToken`, `getRegion`, `getUserRegionAndPartitionForMultiGeo`. Manages Skype token lifecycle and regional endpoint resolution.

`endpointsManager` — Has `createApi` and `createCancelToken`. Factory for creating API clients.

### Network Traffic Patterns

During app startup, the main window interceptor captured auth bootstrapping to `eu-api.asm.skype.com` (skypetokenauth), `eu-prod.asyncgw.teams.microsoft.com` (skypetokenauth, aadtokenauth), and `teams.cloud.microsoft/api/mt/part/emea-02/beta/users/{userId}/cookiev2`.

A trouter WebSocket connection was captured at `wss://go-eu.trouter.teams.microsoft.com/v4/c`. Trouter is Teams' real-time notification/push channel. Messages are received via this WebSocket but sent via HTTP POST from the CDL worker.

Domain patterns observed: `eu-api.asm.skype.com` (Skype token auth), `eu-prod.asyncgw.teams.microsoft.com` (async gateway), `teams.cloud.microsoft/api/chatsvc/{region}/` (chat service), `teams.cloud.microsoft/api/mt/part/{partition}/beta/` (middle-tier API), `go-eu.trouter.teams.microsoft.com` (trouter push).

## Recommended Implementation Approach

Based on the findings, Approach B (Direct API call) is the most viable path for inline message sending from the Quick Chat modal.

The implementation would:

1. Use `reactHandler.acquireToken('https://ic3.teams.office.com')` to get a valid IC3 Bearer token from Teams' own auth provider.

2. Determine the user's region from the `discover` core service (or hardcode based on the `chatsvc` endpoint pattern observed during startup).

3. Construct the POST request with the payload structure documented above. The `conversationId` is already available when the user selects a contact (from the People API or existing conversation list). The `from` user ID (`8:orgid:{aad-object-id}`) is available from the auth service.

4. Make the POST from Electron's main process (using `net.request` or `fetch`), bypassing the worker isolation entirely. The preload script would send the message content via IPC to the main process, which would make the actual HTTP call.

This approach avoids DOM automation fragility, does not require understanding Relay internals, and uses the exact same endpoint and auth that Teams uses natively.

Open questions for implementation: whether the `clientinfo` header values need to match exactly, whether `x-ms-migration` is required, and whether the region can be determined dynamically or should be discovered at startup.

## Spike Tools

Two temporary browser tools were created for this investigation:

- `app/browser/tools/spikeServiceEnumerator.js` — Polls for Teams React root, enumerates all coreServices with their methods and properties
- `app/browser/tools/spikeNetworkInterceptor.js` — Monkey-patches fetch/XHR/WebSocket in the main window context (limited to main thread traffic only; worker traffic was captured via DevTools)

These are branch-only code and should be removed before merging.
