# MQTT Integration

:::info Feature Status
This feature is **disabled by default**. You must explicitly enable it in your configuration.
:::

Teams for Linux includes built-in **bidirectional** MQTT support, allowing you to:
- **Publish** your Microsoft Teams status to an MQTT broker for monitoring and automation
- **Receive** action commands from MQTT to control Teams (toggle mute, video, etc.)

The [automation contract reference](automation-contract-generated.md) is generated from the contract the code reads and lists every topic, payload, retained flag and command in one place, next to what the D-Bus interface offers.

## Overview

The MQTT integration provides two-way communication with your MQTT broker:

### Status Publishing (Outbound)
Automatically detects your Teams presence status (Available, Busy, Do Not Disturb, Away, etc.) and publishes it to a configurable MQTT broker. This enables powerful automation scenarios such as:

- **Smart Home Integration**: Control lights, desk availability indicators, or "on air" signs based on your Teams status
- **Home Assistant Automations**: Trigger scenes, notifications, or device states when you join meetings
- **Status Monitoring**: Track team availability across dashboards and monitoring systems
- **Custom Workflows**: Build Node-RED flows that respond to your Teams presence

### Command Reception (Inbound)
Receive action commands from your MQTT broker to control Teams, enabling scenarios such as:

- **System Keyboard Shortcuts**: Bind global hotkeys (e.g., Super+M) to toggle mute via MQTT
- **Home Automation Actions**: Mute Teams automatically when doorbell rings
- **Stream Deck Integration**: Hardware buttons to control Teams via MQTT
- **Accessibility**: Alternative input methods for users with disabilities

## Features

### Status Publishing Features
- **Real-time Status Updates**: Detects Teams status changes instantly using dual-layer monitoring
- **Robust Detection**: Combines MutationObserver (300ms debounce) with configurable polling fallback
- **Retained Messages**: Last status persists on the broker for new subscribers
- **Deduplication**: Only publishes on actual status changes to prevent MQTT spam

### Command Reception Features
- **Bidirectional Control**: Receive commands from MQTT to control Teams actions
- **Security Validated**: Action whitelist and JSON validation
- **Multiple Actions**: Toggle mute, mute, unmute, toggle video, toggle hand raise, leave the call, and export calendar events
- **Reliable Execution**: Maps commands to Teams keyboard shortcuts

### General Features
- **Automatic Reconnection**: The client reconnects after network interruptions (see [what retained state means](#what-retained-state-means))
- **Secure Authentication**: Supports username/password authentication
- **Configurable Topics**: Customize topic structure to match your MQTT namespace

### What Retained State Means

The state topics are retained, so a subscriber that connects later gets the last value at once. That value is only as fresh as the last publish. Nothing is queued while the app is disconnected from the broker, and after a reconnect the app republishes only the availability topic and the Home Assistant discovery messages, not the state topics. A status detected before the first connection is not published until it changes. Only the availability topic has a last will, so after an unclean exit the other retained topics keep their last value.

The practical rule for consumers is to treat every state topic as valid only while `<topicPrefix>/connected` is `true`. Home Assistant's availability does this for you.

## Quick Start

### 1. Configure MQTT

Create or edit your `config.json` file (see [Configuration Locations](configuration.md#configuration-locations)):

```json
{
  "mqtt": {
    "enabled": true,
    "brokerUrl": "mqtt://192.168.1.100:1883",
    "username": "your-username",
    "password": "your-password",
    "clientId": "teams-for-linux",
    "topicPrefix": "teams",
    "statusTopic": "status",
    "commandTopic": "command",
    "statusCheckInterval": 10000
  }
}
```

### 2. Start Teams for Linux

Launch the application normally. The MQTT client will connect automatically and begin publishing status updates.

### 3. Verify Connection

Use `mosquitto_sub` to verify messages are being published:

```bash
mosquitto_sub -h 192.168.1.100 -t "teams/status" -v
```

You should see JSON messages when your Teams status changes.

## Configuration Options

Add these options under the `mqtt` key in your `config.json`:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | `boolean` | `false` | Enable/disable MQTT integration (both publishing and commands) |
| `brokerUrl` | `string` | `""` | MQTT broker URL (e.g., `mqtt://broker:1883`, or `mqtts://broker:8883` for TLS with the default certificate verification) |
| `username` | `string` | `""` | MQTT username (optional) |
| `password` | `string` | `""` | MQTT password (optional) |
| `clientId` | `string` | `"teams-for-linux"` | Unique client identifier |
| `topicPrefix` | `string` | `"teams"` | Topic prefix for all messages |
| `statusTopic` | `string` | `"status"` | Topic name for status messages (outbound) |
| `commandTopic` | `string` | `""` | Topic name for receiving commands (inbound). Leave empty or omit to disable command reception (status publishing only). Set to `"command"` to enable. |
| `statusCheckInterval` | `number` | `10000` | Polling fallback interval in milliseconds |
| `mediaTopics` | `object` | see [Media Topics](#media-topics) | Custom topic names for media state topics |
| `calendarExport.enabled` | `boolean` | `false` | Let the `get-calendar` command publish your calendar events to the broker. Off by default, so `get-calendar` commands are refused until you set it to `true`; also needs `graphApi.enabled` and a command topic (see [Calendar Data Export](#calendar-data-export)) |

### Topic Structure

**Status Publishing (Outbound)**: `{topicPrefix}/{statusTopic}`
- Example: `teams/status`

**Command Reception (Inbound)**: `{topicPrefix}/{commandTopic}`
- Example: `teams/command`

### Media Topics

The media state topic names (relative to `topicPrefix`) can be customized via `mqtt.mediaTopics`. The defaults are:

```json
{
  "mqtt": {
    "mediaTopics": {
      "inCall": "in-call",
      "incomingCall": "incoming-call",
      "incomingCallCaller": "incoming-call/caller",
      "meetingStarted": "meeting-started",
      "camera": "camera",
      "microphone": "microphone",
      "microphoneControl": "microphone/control",
      "screenSharing": "screen-sharing"
    }
  }
}
```

All keys are optional; omitted keys fall back to the defaults shown above. [Home Assistant discovery](#home-assistant-auto-discovery) configurations automatically use the customized topic names.

> **Note:** `incomingCallCaller` follows `incomingCall`: if you rename `incomingCall` to `ring` and leave `incomingCallCaller` out, the caller topic becomes `ring/caller`. `microphoneControl` does not follow `microphone`, because its default is applied when the configuration loads: renaming `microphone` to `mic` leaves the control topic at `microphone/control` unless you set `microphoneControl` as well.

### Broker URL Formats

- **Plain TCP**: `mqtt://broker.example.com:1883`. The password and every message travel in clear text, so when the app connects to a plain `mqtt://` (or `ws://`) broker that is not on this machine it logs a warning saying so, and with a command topic set it adds that anyone on the network path can send commands. The warning never names the host, URL or topic. Connections to `localhost`, `127.0.0.0/8` addresses and `::1` do not warn.
- **TLS/SSL**: `mqtts://broker.example.com:8883`. The broker's certificate is verified with the default settings only; there is no option for a private certificate authority, a client certificate or skipping verification, so the broker needs a certificate your system already trusts.

:::note WebSocket Support
While the underlying mqtt.js library supports WebSocket URLs (`ws://` and `wss://`), these have not been tested with Teams for Linux. If you successfully use WebSocket connections, please share your experience on [GitHub Issues](https://github.com/IsmaelMartinez/teams-for-linux/issues) or in our [Matrix Space](https://matrix.to/#/#teams-for-linux-space:matrix.org).
:::

## Message Format

Status updates are published as JSON with the following structure:

```json
{
  "status": "busy",
  "statusCode": 2,
  "timestamp": "2025-11-12T14:30:00.000Z",
  "clientId": "teams-for-linux"
}
```

### Fields

- **status** (`string`): Human-readable status name
- **statusCode** (`number`): Numeric status code for easier parsing
- **timestamp** (`string`): ISO 8601 timestamp of when the message was published
- **clientId** (`string`): Client identifier from configuration

### Status Values

| Status | Code | Description |
|--------|------|-------------|
| `unknown` | `-1`, or any other code | A status code outside the known ones, published with the code it was given. When no status is detected at all, nothing is published |
| `available` | `1` | Available / Online |
| `busy` | `2` | Busy / In a call |
| `do_not_disturb` | `3` | Do Not Disturb / Presenting |
| `away` | `4` | Away / Idle |
| `be_right_back` | `5` | Be Right Back |

## MQTT Commands

Teams for Linux can receive action commands via MQTT, allowing external systems to trigger Teams actions like toggle mute, mute, unmute, toggle video, toggle hand raise and leave, and to request calendar events.

The generated [automation contract reference](automation-contract-generated.md#commands) shows what each transport can ask for.

### Command Message Format

Send commands as JSON messages to the command topic (`teams/command` by default):

```json
{
  "action": "toggle-mute",
  "timestamp": "2025-11-12T14:30:00.000Z",
  "requestId": "optional-request-id"
}
```

### Supported Actions

| Action | Teams Shortcut | Description |
|--------|---------------|-------------|
| `toggle-mute` | Ctrl+Shift+M | Toggle microphone mute/unmute |
| `mute` | Ctrl+Shift+M | Mute the microphone (state-aware, see below) |
| `unmute` | Ctrl+Shift+M | Unmute the microphone (state-aware, see below) |
| `toggle-video` | Ctrl+Shift+O | Toggle video on/off |
| `toggle-hand-raise` | Ctrl+Shift+K | Toggle hand raise in meeting |
| `leave` | Ctrl+Shift+H | Leave/hang up the active call |
| `get-calendar` | none | Publish your calendar events to `<topicPrefix>/calendar` (see [Calendar Data Export](#calendar-data-export)) |

### State-Aware Mute and Unmute

Teams only exposes a mute *toggle* shortcut, so `mute` and `unmute` work by tracking the current microphone state (published on the `microphone/control` topic, see [Published Topics](#published-topics)) and only sending the toggle when the state would actually change:

- `mute` is ignored if the microphone is already muted; `unmute` is ignored if already unmuted. `force` never overrides this.
- When the tracked state is `unknown` (before the first microphone event since app start) or `off` (outside a call), both commands are ignored as a safety default. Add `"force": true`, the JSON boolean and nothing else, to send the toggle anyway:

```json
{
  "action": "unmute",
  "force": true
}
```

### Sending Commands

#### Using mosquitto_pub

```bash
# Toggle mute
mosquitto_pub -h localhost -t "teams/command" -m '{"action":"toggle-mute"}' -q 1

# Toggle video
mosquitto_pub -h localhost -t "teams/command" -m '{"action":"toggle-video"}' -q 1

# Toggle hand raise
mosquitto_pub -h localhost -t "teams/command" -m '{"action":"toggle-hand-raise"}' -q 1

# Leave call
mosquitto_pub -h localhost -t "teams/command" -m '{"action":"leave"}' -q 1
```

#### System Keyboard Shortcuts

Create wrapper scripts to bind global keyboard shortcuts:

**1. Create script** (`~/.local/bin/teams-toggle-mute`):

```bash
#!/bin/bash
mosquitto_pub -h localhost -t "teams/command" -m '{"action":"toggle-mute"}' -q 1
```

**2. Make executable**:

```bash
chmod +x ~/.local/bin/teams-toggle-mute
```

**3. Bind in desktop environment**:

- **GNOME**: Settings → Keyboard → Custom Shortcuts
  - Name: "Toggle Teams Mute"
  - Command: `teams-toggle-mute`
  - Shortcut: `Super+M`

- **KDE Plasma**: System Settings → Shortcuts → Custom Shortcuts
  - Add new custom shortcut → Command
  - Trigger: `Meta+M`

### Command Security

Commands are validated with multiple security measures:

- **Action Whitelist**: Only the supported actions are allowed
- **JSON Validation**: Commands must be valid JSON
- **Declared Arguments Only**: Only the arguments listed for a command are read, and an argument of the wrong type counts as absent, so `"force": "true"` is the same as no `force`. Any other property in the message is ignored
- **Size Limit**: A command message longer than 2048 bytes is ignored without being parsed
- **No Replayed Commands**: A command the broker has kept as a retained message is ignored when the broker delivers it on connect or reconnect, with one warning in the log. A command sent with the retain flag while the app is connected still runs once, like any other; it is the stored copy that is never replayed. Publish commands without the retain flag
- **Localhost Recommended**: For maximum security, use a localhost MQTT broker

:::warning Security Notice
Most commands trigger Teams keyboard shortcuts, but `get-calendar` publishes your calendar events to the broker (see [Calendar Data Export](#calendar-data-export)) once you have turned on `mqtt.calendarExport.enabled`, with `graphApi.enabled` on and a command topic set. Anything that can publish to the command topic can send every command; there is no per-command authentication. Only use trusted MQTT brokers and protect your broker credentials. For maximum security, use `mqtt://localhost:1883` with no external network access, and see [What you expose and how to limit it](#what-you-expose-and-how-to-limit-it).
:::

## Calendar Data Export

:::info Prerequisites
Calendar export is off by default. Set `mqtt.calendarExport.enabled` to `true` to allow `get-calendar` commands; it also requires **Graph API** to be enabled in your configuration and a command topic to be set. See [Configuration Options](#configuration-options) for MQTT setup.
:::

:::warning Your calendar goes to the broker
The response is the raw Graph calendar data, which includes event subjects, organiser and attendee names and addresses, body previews and meeting join links. It is published to `<topicPrefix>/calendar` for every subscriber on the broker to read, not only for whoever sent the command.
:::

Teams for Linux can export calendar data via MQTT commands, allowing you to:

- Export calendar events programmatically
- Convert to other formats (org-mode, CSV, iCalendar, etc.)
- Integrate with external scheduling systems
- Process calendar data without maintaining separate authentication

### Calendar Export Command

The `get-calendar` command retrieves calendar events for a specified date range:

```json
{
  "action": "get-calendar",
  "startDate": "2025-11-27T00:00:00Z",
  "endDate": "2025-12-04T23:59:59Z"
}
```

**Parameters:**

- `action`: Must be `"get-calendar"`
- `startDate`: ISO 8601 date or date-time string (start of date range)
- `endDate`: ISO 8601 date or date-time string (end of date range)

Both must be strings in the form `2025-11-27` or `2025-11-27T10:00`, where the date-time can add seconds, a fraction and `Z` or an offset such as `+01:00`. Anything else, including free text after a date and a day the month does not have (30 February), is refused. The start must be before the end and the range at most 366 days. A refused command is logged with a general reason and never with the values you sent.

**Response Topic:** `<topicPrefix>/calendar` (`teams/calendar` with the default prefix). It is not retained, so only subscribers connected when the response is published receive it.

All events in the range are returned: Graph API results are paged, and Teams for Linux follows the paging links and merges every page into one `value` array (capped at 50 pages; if the cap is hit, the response keeps the remaining `@odata.nextLink` to show it is incomplete).

### Calendar Response Format

Calendar data is published to the `<topicPrefix>/calendar` topic as raw Graph API JSON:

```json
{
  "success": true,
  "data": {
    "value": [
      {
        "id": "AAMkAGI1...",
        "subject": "Team Standup",
        "start": {
          "dateTime": "2025-11-27T10:00:00.0000000",
          "timeZone": "UTC"
        },
        "end": {
          "dateTime": "2025-11-27T10:30:00.0000000",
          "timeZone": "UTC"
        },
        "location": {
          "displayName": "Teams Meeting"
        },
        "organizer": {
          "emailAddress": {
            "name": "John Doe",
            "address": "john@example.com"
          }
        },
        "attendees": [...],
        "bodyPreview": "Meeting description...",
        "onlineMeeting": {
          "joinUrl": "https://teams.cloud.microsoft/l/meetup/..."
        }
      }
    ]
  }
}
```

See [Microsoft Graph Calendar API documentation](https://learn.microsoft.com/en-us/graph/api/resources/calendar) for complete field reference.

### Usage

**1. Configuration** - Add to your `config.json`:

```json
{
  "graphApi": {
    "enabled": true
  },
  "mqtt": {
    "enabled": true,
    "brokerUrl": "mqtt://localhost:1883",
    "topicPrefix": "teams",
    "commandTopic": "command"
  }
}
```

**2. Subscribe to calendar data:**

```bash
mosquitto_sub -h localhost -t "teams/calendar" -C 1 | jq
```

**3. Request calendar events:**

```bash
mosquitto_pub -h localhost -t "teams/command" -m '{
  "action": "get-calendar",
  "startDate": "2025-11-29T00:00:00Z",
  "endDate": "2025-12-06T23:59:59Z"
}'
```

:::tip Formatting Output
Use `jq` to format the JSON output for better readability. Install with `apt-get install jq`, `brew install jq`, or `pacman -S jq`.
:::

### Troubleshooting Calendar Export

**No calendar data received:**

- Verify Graph API is enabled in config.json
- Ensure you're logged in to Teams (Graph API requires authentication)
- Check Teams for Linux logs for Graph API errors
- Verify date range parameters are valid ISO 8601 format

**Authentication errors:**

- Log out and log back in to Teams for Linux
- Check Microsoft 365 permissions for your account
- Verify Graph API scopes are granted (Calendars.Read)

**Related:**

- [Graph API Integration](development/adr/030-graph-api-teams-session-token.md)

## Published Topics

When MQTT is enabled, Teams for Linux publishes to the following topics. The generated [automation contract reference](automation-contract-generated.md#topics) lists them with their gates, and the [AsyncAPI document](https://ismaelmartinez.github.io/teams-for-linux/mqtt-asyncapi.json) describes them for tools that read it. All are retained except the caller and calendar topics.

| Topic | Payload | Description |
|-------|---------|-------------|
| `{topicPrefix}/connected` | `"true"` or `"false"` | App connection state (uses MQTT Last Will and Testament) |
| `{topicPrefix}/{statusTopic}` | JSON object | User presence status (see [Message Format](#message-format) above) |
| `{topicPrefix}/in-call` | `"true"` or `"false"` | Active call state via IPC events and WebRTC fallback |
| `{topicPrefix}/incoming-call` | `"true"` or `"false"` | Incoming call ringing state |
| `{topicPrefix}/incoming-call/caller` | JSON object | Caller of the ringing call; not retained, requires [`mqtt.incomingCallCaller.enabled`](#incoming-call-caller) |
| `{topicPrefix}/meeting-started` | `"true"` or `"false"` | Scheduled-meeting-start pulse (experimental, requires [`mqtt.meetingStartDetection.enabled`](#meeting-start-detection-experimental)) |
| `{topicPrefix}/camera` | `"true"` or `"false"` | Camera on/off state |
| `{topicPrefix}/microphone` | `"speaking"`, `"silent"`, `"muted"`, or `"off"` | Microphone state from WebRTC speaking-indicator monitoring |
| `{topicPrefix}/microphone/control` | `"muted"`, `"unmuted"`, or `"off"` | Simplified mute state derived from the microphone state; drives the [`mute`/`unmute` command guard](#state-aware-mute-and-unmute) |
| `{topicPrefix}/screen-sharing` | `"true"` or `"false"` | Screen sharing active state |
| `{topicPrefix}/calendar` | JSON object | Calendar events, only in answer to a [`get-calendar` command](#calendar-data-export); not retained, requires `graphApi.enabled` and a command topic |

The media topic names after the prefix (`in-call`, `incoming-call`, `incoming-call/caller`, `meeting-started`, `camera`, `microphone`, `microphone/control`, `screen-sharing`) are defaults and can be customized via [`mqtt.mediaTopics`](#media-topics).

The retained topics give subscribers the last known state immediately on connect. The `connected` topic uses a last will: if the app crashes or loses network, the broker publishes `"false"` on it, and it is the only topic that is cleared that way. Every message is published with QoS 0.

The microphone topic activates whenever `mqtt.enabled` is true (no separate toggle). States are derived from WebRTC `RTCPeerConnection.getStats()`: `speaking` means audio is being transmitted, `silent` means the mic is open but quiet, `muted` means the outgoing audio sender stopped sending (its track is disabled, muted, ended or detached, its encoding is paused, or its negotiated direction no longer sends) or Teams has zeroed the audio signal, and `off` means no active call. When the sender shows none of these, a zeroed signal is taken as muted, so a microphone with built-in noise reduction that outputs silence while you are quiet also reports `muted` after about half a second.

The camera topic monitors video sender `track.enabled` in the same RTCPeerConnection poll loop used for microphone detection, filtering out screen-sharing tracks via `displaySurface`.

### Incoming Call Caller

This topic is off by default, since it sends the names and numbers of the people who call you (colleagues on Teams as well as outside callers) to the broker. Turn it on with:

```json
{
  "mqtt": {
    "incomingCallCaller": {
      "enabled": true
    }
  }
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `incomingCallCaller.enabled` | `boolean` | `false` | Publish the ringing call's caller to `{topicPrefix}/incoming-call/caller` |

While a call is ringing, `{topicPrefix}/incoming-call/caller` then holds a JSON object saying who is calling:

```json
{
  "scenario": "incoming_call_queue_call",
  "number": "+1 555-010-0001",
  "name": "Pat Example",
  "queue": "Support Queue",
  "contact": true,
  "callId": "00000000-0000-0000-0000-000000000000",
  "timestamp": "2026-09-27T19:07:09.834Z",
  "clientId": "teams-for-linux"
}
```

| Field | Present | Meaning |
|-------|---------|---------|
| `scenario` | always | Teams' name for the kind of call: `incoming_call` (from a Teams user), `incoming_pstn_call` (from a phone number), `incoming_call_queue_call` or `conference_incoming_call_queue_call` (through a call queue) |
| `number` | caller has a phone number | The caller's number as Teams formats it |
| `name` | Teams knows the caller | The caller's name |
| `queue` | call-queue calls | The call queue the call came in through |
| `contact` | Teams has judged the caller | `true` when the caller is one of your contacts |
| `callId` | when Teams gives one | Teams' identifier for the call |
| `timestamp` | always | When this was published, in ISO 8601, as on the status topic |
| `clientId` | always | The configured `mqtt.clientId`, as on the status topic |

The caller is published just before `incoming-call` goes `"true"`, so an automation triggered by the ring has it already. Unlike the other topics it is **not retained**: it describes a call that is ringing now, and a retained copy could outlive the call if the app quit or lost the broker mid-ring. A subscriber that connects while a call is already ringing therefore sees `incoming-call` as `"true"` but no caller until Teams announces the call again. There is nothing to clear when the ringing stops; `incoming-call` going `"false"` says so.

A call-queue call in conference mode is announced twice while it rings. The first announcement can come before Teams has matched the caller, in which case `name` is missing and `queue` holds Teams' placeholder (`"Unknown user"` in English) rather than the queue's name; the second, a moment later, carries both. Nothing in the first announcement reliably tells the placeholder apart from a real queue name, so it is published as Teams gives it.

The caller's details are never written to the log.

## Meeting Start Detection (Experimental)

When a scheduled meeting starts, Teams shows a "Meeting Started" banner (and a toast when someone explicitly starts it). Teams for Linux detects this primarily through Teams' internal command stream, which carries the banner as structured, locale-independent data, with a DOM text-match fallback, and publishes a pulse to `{topicPrefix}/meeting-started`: `"true"` on detection, back to `"false"` on whichever comes first, joining the call or `resetSeconds` elapsing. This lets Home Assistant automations fire when a scheduled meeting actually becomes active, not just when it was scheduled (issue [#2587](https://github.com/IsmaelMartinez/teams-for-linux/issues/2587)).

The feature is off by default. Enable it alongside MQTT:

```json
{
  "mqtt": {
    "enabled": true,
    "brokerUrl": "mqtt://192.168.1.100:1883",
    "meetingStartDetection": {
      "enabled": true,
      "patterns": ["meeting started", "started the meeting"],
      "resetSeconds": 10
    }
  }
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `meetingStartDetection.enabled` | `boolean` | `false` | Enable toast detection and the `meeting-started` topic |
| `meetingStartDetection.patterns` | `string[]` | `["meeting started", "started the meeting"]` | Case-insensitive regular expressions for the DOM fallback path |
| `meetingStartDetection.resetSeconds` | `number` | `10` | Seconds before the topic resets to `"false"` if you never join. Joining resets it immediately |

**Known limitations:**

- **Best-effort and fragile.** Detection relies on matching the toast text in the Teams UI. Microsoft can reword the toast or restructure the DOM at any time, which silently breaks detection until patterns are updated.
- **English-only default.** The default pattern only matches the English toast. If your Teams UI runs in another language, set `patterns` to the wording your locale uses, for example `"hat die Besprechung gestartet"` for German. Patterns are compiled as case-insensitive regular expressions.
- **No end signal.** Teams provides nothing when the meeting ends, so the topic is a momentary pulse rather than a persistent state.
- **Privacy.** The toast text contains the name of the person who started the meeting. It is never logged and never published; only the detection event itself reaches MQTT.

## Home Assistant Auto-Discovery

When `mqtt.homeAssistant.enabled` is set to `true`, Teams for Linux publishes [MQTT Discovery](https://www.home-assistant.io/integrations/mqtt/#mqtt-discovery) configurations so Home Assistant automatically creates entities for your Teams state. No manual YAML entity definitions needed.

### Configuration

```json
{
  "mqtt": {
    "enabled": true,
    "brokerUrl": "mqtt://192.168.1.100:1883",
    "clientId": "teams-for-linux",
    "topicPrefix": "teams",
    "commandTopic": "command",
    "homeAssistant": {
      "enabled": true,
      "discoveryPrefix": "homeassistant",
      "deviceName": "Teams for Linux"
    }
  }
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `mqtt.homeAssistant.enabled` | `boolean` | `false` | Publish HA discovery configs on connect |
| `mqtt.homeAssistant.discoveryPrefix` | `string` | `"homeassistant"` | Discovery topic prefix (must match HA's `discovery_prefix` setting) |
| `mqtt.homeAssistant.deviceName` | `string` | `"Teams for Linux"` | Device name shown in HA |

### Entities Created

All entities are grouped under a single HA device (identified by `mqtt.clientId`; entities are keyed by it, so changing it creates new entities in Home Assistant). Availability is tied to the `{topicPrefix}/connected` LWT topic.

| HA Component | Entity | State Topic | Description |
|-------------|--------|-------------|-------------|
| `sensor` | Teams Status | `{topicPrefix}/{statusTopic}` | Presence status (`available`, `busy`, `do_not_disturb`, `away`, `be_right_back`) |
| `sensor` | Teams Microphone | `{topicPrefix}/microphone` | Microphone state (speaking, silent, muted, off) |
| `binary_sensor` | Teams In Call | `{topicPrefix}/in-call` | Whether you are in an active call |
| `binary_sensor` | Teams Incoming Call | `{topicPrefix}/incoming-call` | Whether a call is ringing |
| `binary_sensor` | Teams Meeting Started | `{topicPrefix}/meeting-started` | Pulses on when a scheduled-meeting-start toast is detected (see [Meeting Start Detection](#meeting-start-detection-experimental)) |
| `binary_sensor` | Teams Screen Sharing | `{topicPrefix}/screen-sharing` | Whether screen sharing is active |
| `binary_sensor` | Teams Camera | `{topicPrefix}/camera` | Whether the camera is on |
| `button` | Teams Toggle Mute | via `commandTopic` | Sends `{"action":"toggle-mute"}` |
| `button` | Teams Toggle Video | via `commandTopic` | Sends `{"action":"toggle-video"}` |
| `button` | Teams Toggle Hand Raise | via `commandTopic` | Sends `{"action":"toggle-hand-raise"}` |
| `button` | Teams Leave Call | via `commandTopic` | Sends `{"action":"leave"}` |

Button entities are only created when `commandTopic` is set (bidirectional mode). Discovery configs are republished on every broker reconnect so entities survive broker restarts.

### Example Automation

```yaml
automation:
  - alias: "Office busy light on call"
    trigger:
      - platform: state
        entity_id: binary_sensor.teams_for_linux_in_call
        to: "on"
    action:
      - action: light.turn_on
        target:
          entity_id: light.office_status
        data:
          color_name: red
          brightness: 255

  - alias: "Office light available when call ends"
    trigger:
      - platform: state
        entity_id: binary_sensor.teams_for_linux_in_call
        to: "off"
    action:
      - action: light.turn_on
        target:
          entity_id: light.office_status
        data:
          color_name: green
          brightness: 128
```

## Other Home Automation Platforms

The MQTT integration works with any MQTT-compatible platform. If you've integrated Teams for Linux with your home automation system, share your configurations on [GitHub Issues](https://github.com/IsmaelMartinez/teams-for-linux/issues) or the [Matrix Space](https://matrix.to/#/#teams-for-linux-space:matrix.org).

## Testing & Troubleshooting

### Testing with Mosquitto

#### Testing Status Publishing

**1. Start a local broker** (for testing):

```bash
mosquitto -v
```

**2. Subscribe to status topic**:

```bash
mosquitto_sub -h localhost -t "teams/status" -v
```

**3. Change your Teams status** and watch for messages in the subscriber terminal.

#### Testing Command Reception

**1. Ensure Teams for Linux is running with MQTT enabled**

**2. Send test commands**:

```bash
# Test toggle mute
mosquitto_pub -h localhost -t "teams/command" -m '{"action":"toggle-mute"}' -q 1

# Test toggle video
mosquitto_pub -h localhost -t "teams/command" -m '{"action":"toggle-video"}' -q 1
```

**3. Expected behavior**:
- Teams should execute the corresponding keyboard shortcut
- Application logs should show: `[MQTT] Received valid command: <action>`
- Application logs should show: `[MQTT] Executed command '<action>' -> <shortcut>`

### Common Issues

#### No Messages Published

**Symptoms**: MQTT subscriber receives no messages when Teams status changes

**Solutions**:
- Verify `mqtt.enabled` is set to `true` in `config.json`
- Check broker URL, username, and password are correct
- Ensure the broker is reachable from your network
- Check Teams for Linux logs for MQTT connection errors
- Verify your Teams status is actually changing in the Teams web interface

#### Connection Refused

**Symptoms**: "Connection refused" or "ECONNREFUSED" errors in logs

**Solutions**:
- Verify the MQTT broker is running: `netstat -an | grep 1883`
- Check firewall rules allow connections to the broker port
- Test connectivity: `telnet <broker_address> 1883`
- Verify broker URL format (e.g., `mqtt://` not `http://`)

#### Authentication Failed

**Symptoms**: "Not authorized" or authentication errors

**Solutions**:
- Verify username and password are correct
- Check broker ACL (Access Control List) allows publishing to your topic
- Test credentials with `mosquitto_pub`:
  ```bash
  mosquitto_pub -h broker -u username -P password -t test -m "test"
  ```

#### Status Detection Not Working

**Symptoms**: No status messages are published, or the status does not follow your Teams status

**Solutions**:
- The app publishes nothing when it cannot detect a status; `unknown` appears only for a status code outside the known ones
- Detection reads the Teams page, so it may fail if the Teams UI structure has changed
- Decrease `statusCheckInterval` for more frequent polling: `"statusCheckInterval": 5000`
- Check browser console (DevTools) for JavaScript errors
- Report the issue on [GitHub Issues](https://github.com/IsmaelMartinez/teams-for-linux/issues) with Teams version info

#### Commands Not Working

**Symptoms**: MQTT commands sent but Teams doesn't respond

**Solutions**:
- Verify MQTT is enabled in config (`"enabled": true`)
- Ensure the command topic is correct (`teams/command` by default)
- Check application logs for validation errors
- Verify JSON is valid (use a JSON validator)
- Ensure action is in the whitelist (see [Supported Actions](#supported-actions) above)
- Check spelling and case sensitivity (use lowercase with hyphens)

#### Window Not Available Error

**Symptoms**: Logs show "window not available" when sending commands

**Solutions**:
- Ensure Teams for Linux window is open
- The application must be running for commands to work
- Check that the window is not destroyed or minimized to tray

### Debug Logging

Enable debug logging to see detailed MQTT activity:

```bash
ELECTRON_ENABLE_LOGGING=true teams-for-linux
```

For more logging options, see the **[Troubleshooting Guide](troubleshooting.md)**.

Check logs for MQTT-related messages:
- Connection attempts and results
- Status change detections
- Publish confirmations
- Error details

## Security Considerations

:::warning Important
You should take extra care when sharing your status with other systems, especially externally. Monitor your MQTT subscribers, protect your passwords, rotate credentials regularly, isolate your local network from the Internet, and follow other security best practices.

**We cannot take responsibility for any misuse of this feature or the application** as stated in our [LICENSE.md](https://github.com/IsmaelMartinez/teams-for-linux/blob/master/LICENSE.md) file.
:::

### Basic Security Practices

- **Use Authentication**: Always configure username/password for your MQTT broker
- **Enable TLS**: Use `mqtts://` URLs for encrypted connections when possible
- **Protect Credentials**: Passwords in `config.json` are stored in plain text - use appropriate file permissions (`chmod 600`)
- **Monitor Access**: Regularly review who has access to your MQTT broker and topics

### What you expose and how to limit it

What the broker's users can see and do depends on what you configure:

| Configuration | What it exposes |
|---------------|-----------------|
| `mqtt.enabled` | Your presence and call state: in call, ringing, camera, microphone and screen sharing, and the meeting-started pulse when it is enabled |
| `mqtt.commandTopic` | Anyone who can publish there can send every command: toggle or set the microphone, toggle the camera and hand raise, and leave the call |
| `mqtt.incomingCallCaller.enabled` | The names and phone numbers of people who call you |
| A command topic plus `graphApi.enabled` | Your calendar events, on request, through `get-calendar` |

To limit it, keep the broker on localhost or use `mqtts://` with a certificate your system trusts, require a broker login, and use the broker's access control so each account can do only what it needs. The app's account only needs to publish under its prefix and read its command topic. Your automation's account only needs to read the prefix and publish to the command topic. There is no per-command authentication, so the account that can publish to the command topic can send all of them.

A minimal Mosquitto setup for that, with `teams` as the prefix and `command` as the command topic. Create the password file with `mosquitto_passwd` (`-c` creates the file and overwrites an existing one, so use it for the first user only; it prompts for the password):

```bash
mosquitto_passwd -c /etc/mosquitto/passwd teams-app
mosquitto_passwd /etc/mosquitto/passwd automation
```

Then in `mosquitto.conf`, turn off anonymous access and point to the password and ACL files:

```
allow_anonymous false
password_file /etc/mosquitto/passwd
acl_file /etc/mosquitto/acl
```

And in `/etc/mosquitto/acl`:

```
user teams-app
topic write teams/#
topic read teams/command

user automation
topic read teams/#
topic write teams/command
```

Mosquitto's [configuration reference](https://mosquitto.org/man/mosquitto-conf-5.html) says that with an ACL file only the topics listed have access, and that the topic lines after a `user` line apply to that user. The write rule for the app's account covers `teams/connected`, the availability topic. With Home Assistant discovery enabled, the app's account also needs write access to the discovery prefix, for example `topic write homeassistant/#`, and Home Assistant needs to read the topics it subscribes to.

### Multiple accounts

MQTT is not profile-aware. The state topics report whichever profile's page last reported, and keyboard-shortcut commands go to the main window, not to the selected profile. The [D-Bus service](development/dbus-control.md) follows the selected profile.

## How It Works

Status detection runs in the Teams page (`app/browser/tools/mqttStatusMonitor.js`). It watches the page for changes with a MutationObserver, debounced by 300ms, and also polls every `statusCheckInterval` milliseconds as a fallback. It tries several ways of reading the status (CSS selectors, the profile control, the page title). When it finds one that differs from the last, it sends it to the main process, which publishes it through the MQTT client in `app/mqtt/index.js`. When it finds none, nothing is sent. The call, camera, microphone and screen-sharing topics come from the same page, through `app/mqtt/mediaStatusService.js`.

Commands travel the other way. The client subscribes to the command topic when it connects and accepts only a JSON object whose `action` is in the [supported actions](#supported-actions) list. A shortcut action is sent as a keyboard event to the main Teams window, and `get-calendar` fetches the events through the Graph API and publishes them.

## Home Assistant Automation Examples

### Flash Light on Incoming Call

Use the `incoming-call` topic to trigger a visual alert when Teams rings. The second automation restores the light when the call ends or when the app disconnects (crash recovery via LWT).

```yaml
automation:
  - alias: "Teams incoming call — orange LED"
    trigger:
      - platform: mqtt
        topic: "teams/incoming-call"
        payload: "true"
    action:
      service: light.turn_on
      target:
        entity_id: light.office
      data:
        rgb_color: [255, 140, 0]
        flash: short

  - alias: "Teams incoming call cleared — restore LED"
    trigger:
      - platform: mqtt
        topic: "teams/incoming-call"
        payload: "false"
      - platform: mqtt
        topic: "teams/connected"
        payload: "false"
    action:
      service: light.turn_off
      target:
        entity_id: light.office
```

The `teams/connected=false` trigger handles the crash case: if the app exits unexpectedly, the MQTT LWT message fires and the automation resets the light rather than leaving it orange indefinitely.

## Related Documentation

- **[Configuration Guide](configuration.md)** - Complete configuration options
- **[Multiple Instances](multiple-instances.md)** - Running work/personal profiles
- **[IPC API Reference](development/ipc-api.md)** - Inter-process communication details
- **[Troubleshooting](troubleshooting.md)** - Common issues and solutions

## References

- [MQTT.org](https://mqtt.org/) - MQTT protocol specification
- [Mosquitto](https://mosquitto.org/) - Popular open-source MQTT broker
