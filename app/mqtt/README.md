# MQTT Module

This module provides MQTT integration for Teams for Linux, allowing you to publish your Teams status to an MQTT broker for home automation and integration purposes.

## Features

- Publishes Teams status changes to MQTT broker
- Configurable MQTT connection settings
- JSON payload with status, timestamp, and client information
- Automatic reconnection handling
- Retained messages for persistent status
- Status change detection to avoid duplicate publishes

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
    "statusTopic": "status"
  }
}
```

### Configuration Options

- **enabled**: `boolean` - Enable/disable MQTT publishing (default: false)
- **brokerUrl**: `string` - MQTT broker URL (e.g., `mqtt://192.168.1.100:1883`)
- **username**: `string` - MQTT username (optional)
- **password**: `string` - MQTT password (optional)
- **clientId**: `string` - Unique client identifier (default: "teams-for-linux")
- **topicPrefix**: `string` - Topic prefix for all messages (default: "teams")
- **statusTopic**: `string` - Topic name for status messages (default: "status")

## MQTT Topics

Status updates are published to: `{topicPrefix}/{statusTopic}`

Example: `teams/status`

## Message Format

Status messages are published as JSON with the following structure:

```json
{
  "status": "available",
  "statusCode": 1,
  "timestamp": "2023-01-15T10:30:00.000Z",
  "clientId": "teams-for-linux"
}
```

### Status Values

- `unknown` (code: -1) - Status unknown
- `available` (code: 1) - Available
- `busy` (code: 2) - Busy
- `do_not_disturb` (code: 3) - Do Not Disturb
- `away` (code: 4) - Away
- `be_right_back` (code: 5) - Be Right Back

## Home Automation Integration

### Home Assistant Example

```yaml
mqtt:
  sensor:
    - name: "Teams Status"
      state_topic: "teams/status"
      value_template: "{{ value_json.status }}"
      json_attributes_topic: "teams/status"
      json_attributes_template: "{{ value_json | tojson }}"

automation:
  - alias: "Teams Status Changed"
    trigger:
      - platform: state
        entity_id: sensor.teams_status
    action:
      - service: notify.mobile_app
        data:
          message: "Teams status changed to {{ trigger.to_state.state }}"
```

### Node-RED Example

```json
[
  {
    "id": "mqtt-teams",
    "type": "mqtt in",
    "topic": "teams/status",
    "name": "Teams Status",
    "server": "mqtt-broker",
    "wires": [["process-status"]]
  },
  {
    "id": "process-status",
    "type": "function",
    "name": "Process Teams Status",
    "func": "const data = JSON.parse(msg.payload);\nmsg.payload = data.status;\nreturn msg;",
    "wires": [["status-output"]]
  }
]
```

## Testing

To test the MQTT integration, you can use mosquitto:

```bash
# Start mosquitto broker
mosquitto -v

# Subscribe to status topic
mosquitto_sub -h localhost -t "teams/status" -v
```

## Troubleshooting

1. **Connection Issues**: Check broker URL, credentials, and network connectivity
2. **No Status Updates**: Verify MQTT is enabled and Teams status is changing
3. **Authentication Errors**: Validate username/password configuration
4. **Topic Not Receiving**: Check topic configuration and broker permissions

Enable debug logging to see MQTT activity in the application logs.

## Architecture

The MQTT module consists of:

- **MQTTClient** (`app/mqtt/index.js`) - Main MQTT client managing connection and publishing
- **StatusMonitor** (`app/browser/tools/mqttStatusMonitor.js`) - Browser-side status detection
- **IPC Integration** - Communication between browser and main process via `user-status-changed` channel

## Implementation Notes

- Status detection uses DOM polling (configurable interval)
- Only publishes status changes (not duplicates)
- Retains last message for persistence
- Automatically reconnects on connection loss
- Gracefully handles Teams UI changes
