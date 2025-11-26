# MQTT Module

This module provides bidirectional MQTT integration for Teams for Linux, allowing you to:
- **Publish** your Teams status to an MQTT broker for home automation
- **Receive** action commands from MQTT to control Teams (toggle mute, video, etc.)

## Features

### Status Publishing (Outbound)
- Publishes Teams status changes to MQTT broker
- JSON payload with status, timestamp, and client information
- Automatic reconnection handling
- Retained messages for persistent status
- Status change detection to avoid duplicate publishes

### Command Reception (Inbound)
- Receives action commands from MQTT broker
- Executes Teams keyboard shortcuts (toggle mute, video, raise hand, etc.)
- Security features: action whitelist, JSON validation
- Configurable MQTT connection settings

## Configuration

The MQTT module is configured through the main application configuration. Add the following to your `config.json`:

```json
{
  "mqtt": {
    "enabled": true,
    "brokerUrl": "mqtt://your-mqtt-broker:1883",
    "username": "your-username",
    "password": "your-password",
    "clientId": "teams-for-linux",
    "topicPrefix": "teams",
    "statusTopic": "status",
    "commandTopic": "command"
  }
}
```

### Configuration Options

- **enabled**: `boolean` - Enable/disable MQTT integration (default: false)
- **brokerUrl**: `string` - MQTT broker URL (e.g., `mqtt://192.168.1.100:1883`)
- **username**: `string` - MQTT username (optional)
- **password**: `string` - MQTT password (optional)
- **clientId**: `string` - Unique client identifier (default: "teams-for-linux")
- **topicPrefix**: `string` - Topic prefix for all messages (default: "teams")
- **statusTopic**: `string` - Topic name for status messages (default: "status")
- **commandTopic**: `string` - Topic name for receiving commands (default: "" - disabled). Set to "command" to enable bidirectional mode.

## MQTT Topics

### Status Publishing (Outbound)
Status updates are published to: `{topicPrefix}/{statusTopic}`

Example: `teams/status`

### Command Reception (Inbound)
Commands are received from: `{topicPrefix}/{commandTopic}`

Example: `teams/command`

## Message Format

### Status Messages (Outbound)

Status messages are published as JSON with the following structure:

```json
{
  "status": "available",
  "statusCode": 1,
  "timestamp": "2023-01-15T10:30:00.000Z",
  "clientId": "teams-for-linux"
}
```

#### Status Values

- `unknown` (code: -1) - Status unknown
- `available` (code: 1) - Available
- `busy` (code: 2) - Busy
- `do_not_disturb` (code: 3) - Do Not Disturb
- `away` (code: 4) - Away
- `be_right_back` (code: 5) - Be Right Back

### Command Messages (Inbound)

Command messages should be sent as JSON with the following structure:

```json
{
  "action": "toggle-mute",
  "timestamp": "2023-01-15T10:30:00.000Z",
  "requestId": "optional-request-id"
}
```

#### Supported Actions

- `toggle-mute` - Toggle microphone mute (Ctrl+Shift+M)
- `toggle-video` - Toggle video on/off (Ctrl+Shift+O)
- `raise-hand` - Raise/lower hand in meeting (Ctrl+Shift+K)

#### Command Security

Commands are validated with the following security measures:
- **Action whitelist**: Only the supported actions listed above are allowed
- **JSON validation**: Commands must be valid JSON
- **Localhost recommended**: For maximum security, use a localhost MQTT broker (`mqtt://localhost:1883`)

#### Sending Commands

Using `mosquitto_pub`:

```bash
# Toggle mute
mosquitto_pub -h localhost -t "teams/command" -m '{"action":"toggle-mute"}' -q 1

# Toggle video
mosquitto_pub -h localhost -t "teams/command" -m '{"action":"toggle-video"}' -q 1

# Raise hand
mosquitto_pub -h localhost -t "teams/command" -m '{"action":"raise-hand"}' -q 1
```

## Testing

### Testing Status Publishing

To test status publishing, use mosquitto to subscribe to the status topic:

```bash
# Start mosquitto broker (if not already running)
mosquitto -v

# In another terminal, subscribe to status topic
mosquitto_sub -h localhost -t "teams/status" -v

# Change your Teams status and watch for updates
```

### Testing Command Reception

To test command reception, publish test commands:

```bash
# Test toggle mute
mosquitto_pub -h localhost -t "teams/command" -m '{"action":"toggle-mute"}' -q 1

# Test toggle video
mosquitto_pub -h localhost -t "teams/command" -m '{"action":"toggle-video"}' -q 1

# Test with timestamp and requestId
mosquitto_pub -h localhost -t "teams/command" -m '{"action":"raise-hand","timestamp":"2025-01-15T10:30:00Z","requestId":"test-123"}' -q 1
```

**Expected behavior:**
- Teams should execute the corresponding keyboard shortcut
- Application logs should show: `[MQTT] Received valid command: <action>`
- Application logs should show: `[MQTT] Executed command '<action>' -> <shortcut>`

## Troubleshooting

### Status Publishing Issues

1. **Connection Issues**: Check broker URL, credentials, and network connectivity
2. **No Status Updates**: Verify MQTT is enabled and Teams status is changing
3. **Authentication Errors**: Validate username/password configuration
4. **Topic Not Receiving**: Check topic configuration and broker permissions

### Command Reception Issues

1. **Commands Not Working**:
   - Verify MQTT is enabled in config
   - Check that you're subscribed to the command topic (`teams/command`)
   - Check application logs for validation errors
   - Ensure JSON is valid (use a JSON validator)

2. **Invalid Action Errors**:
   - Verify action is in the whitelist: `toggle-mute`, `toggle-video`, `raise-hand`
   - Check spelling and case sensitivity (use lowercase with hyphens)

3. **Window Not Available**:
   - Ensure Teams for Linux window is open
   - Check logs for "window not available" messages

Enable debug logging to see MQTT activity in the application logs.

## Architecture

The MQTT module consists of:

- **MQTTClient** (`app/mqtt/index.js`) - Main MQTT client managing bidirectional communication
  - Publishes status updates to broker
  - Subscribes to command topic
  - Validates and processes incoming commands
  - Emits command events to main process
- **StatusMonitor** (`app/browser/tools/mqttStatusMonitor.js`) - Browser-side status detection using MutationObserver + polling
- **Command Execution** (`app/index.js`) - Main process command handler that maps actions to keyboard shortcuts
- **IPC Integration** - Communication between browser and main process via `user-status-changed` channel

## Implementation Notes

### Status Detection Strategy

The status monitor uses a dual-layer approach for robust detection:

1. **MutationObserver (Primary)** - Watches for real-time DOM changes with 300ms debouncing
   - Monitors status-related attributes: `class`, `aria-label`, `title`, `data-testid`
   - Debounced to prevent excessive checks during UI animations
   - Provides instant updates when Teams status changes

2. **Polling (Fallback)** - Periodic checks as backup (default: 10 seconds, configurable)
   - Ensures status is detected even if DOM events are missed
   - Configurable via `mqtt.statusCheckInterval` in config

### Command Processing Flow

1. **MQTT Broker** receives command from external source (mosquitto_pub, automation systems, etc.)
2. **MQTTClient** receives message on command topic
3. **Validation** checks JSON format and action whitelist
4. **Event Emission** MQTTClient emits 'command' event
5. **Main Process** maps action to Teams keyboard shortcut
6. **Execution** sends keyboard event to Teams window via `sendKeyboardEventToWindow`

### Security Features

- **Action Whitelist**: Only predefined actions are allowed
- **JSON Validation**: Commands must be valid JSON objects
- **Localhost Recommendation**: Users should use localhost broker for maximum security

### Additional Features

- Only publishes status changes (deduplication prevents MQTT spam)
- Retains last message for persistence (new subscribers get current status)
- Automatically reconnects on connection loss
- Gracefully handles Teams UI changes with multiple detection strategies
- Command validation with detailed error logging
