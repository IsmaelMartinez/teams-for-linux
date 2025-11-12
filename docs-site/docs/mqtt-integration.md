# MQTT Integration

Teams for Linux includes built-in MQTT support, allowing you to publish your Microsoft Teams status to an MQTT broker for home automation, monitoring, and integration with other systems.

## Overview

The MQTT integration automatically detects your Teams presence status (Available, Busy, Do Not Disturb, Away, etc.) and publishes it to a configurable MQTT broker. This enables powerful automation scenarios such as:

- **Smart Home Integration**: Control lights, desk availability indicators, or "on air" signs based on your Teams status
- **Home Assistant Automations**: Trigger scenes, notifications, or device states when you join meetings
- **Status Monitoring**: Track team availability across dashboards and monitoring systems
- **Custom Workflows**: Build Node-RED flows that respond to your Teams presence

## Features

- **Real-time Status Updates**: Detects Teams status changes instantly using dual-layer monitoring
- **Robust Detection**: Combines MutationObserver (300ms debounce) with configurable polling fallback
- **Automatic Reconnection**: Handles network interruptions gracefully
- **Retained Messages**: Last status persists on the broker for new subscribers
- **Deduplication**: Only publishes on actual status changes to prevent MQTT spam
- **Secure Authentication**: Supports username/password authentication
- **Configurable Topics**: Customize topic structure to match your MQTT namespace

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
| `enabled` | `boolean` | `false` | Enable/disable MQTT publishing |
| `brokerUrl` | `string` | `""` | MQTT broker URL (e.g., `mqtt://broker:1883` or `mqtts://broker:8883` for TLS) |
| `username` | `string` | `""` | MQTT username (optional) |
| `password` | `string` | `""` | MQTT password (optional) |
| `clientId` | `string` | `"teams-for-linux"` | Unique client identifier |
| `topicPrefix` | `string` | `"teams"` | Topic prefix for all messages |
| `statusTopic` | `string` | `"status"` | Topic name for status messages |
| `statusCheckInterval` | `number` | `10000` | Polling fallback interval in milliseconds |

### Topic Structure

Status updates are published to: `{topicPrefix}/{statusTopic}`

**Example**: With default settings, messages are published to `teams/status`

### Broker URL Formats

- **Plain TCP**: `mqtt://broker.example.com:1883`
- **TLS/SSL**: `mqtts://broker.example.com:8883`
- **WebSocket**: `ws://broker.example.com:9001`
- **Secure WebSocket**: `wss://broker.example.com:9001`

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
- **timestamp** (`string`): ISO 8601 timestamp of the status change
- **clientId** (`string`): Client identifier from configuration

### Status Values

| Status | Code | Description |
|--------|------|-------------|
| `unknown` | `-1` | Status cannot be determined |
| `available` | `1` | Available / Online |
| `busy` | `2` | Busy / In a call |
| `do_not_disturb` | `3` | Do Not Disturb / Presenting |
| `away` | `4` | Away / Idle |
| `be_right_back` | `5` | Be Right Back |

## Home Automation Examples

### Home Assistant

Create sensors and automations based on Teams status:

```yaml
mqtt:
  sensor:
    - name: "Teams Status"
      state_topic: "teams/status"
      value_template: "{{ value_json.status }}"
      json_attributes_topic: "teams/status"
      json_attributes_template: "{{ value_json | tojson }}"
      icon: mdi:microsoft-teams

automation:
  - alias: "Turn on busy light when in Teams meeting"
    trigger:
      - platform: state
        entity_id: sensor.teams_status
        to: "busy"
    action:
      - service: light.turn_on
        target:
          entity_id: light.office_status_light
        data:
          color_name: red
          brightness: 255

  - alias: "Turn off busy light when Teams available"
    trigger:
      - platform: state
        entity_id: sensor.teams_status
        to: "available"
    action:
      - service: light.turn_off
        target:
          entity_id: light.office_status_light
```

#### Advanced Home Assistant Example

Control multiple devices and send notifications:

```yaml
automation:
  - alias: "Teams Meeting Started"
    trigger:
      - platform: state
        entity_id: sensor.teams_status
        to: "busy"
    action:
      # Turn on "On Air" sign
      - service: switch.turn_on
        target:
          entity_id: switch.on_air_sign

      # Set office lights to meeting mode
      - service: scene.turn_on
        target:
          entity_id: scene.office_meeting_mode

      # Notify family members
      - service: notify.mobile_app_family
        data:
          message: "Dad is in a Teams meeting"
          title: "Do Not Disturb"

      # Mute smart speakers
      - service: media_player.volume_mute
        target:
          entity_id: media_player.office_speaker
        data:
          is_volume_muted: true

  - alias: "Teams Meeting Ended"
    trigger:
      - platform: state
        entity_id: sensor.teams_status
        to: "available"
        from: "busy"
    action:
      # Turn off "On Air" sign
      - service: switch.turn_off
        target:
          entity_id: switch.on_air_sign

      # Restore office lights
      - service: scene.turn_on
        target:
          entity_id: scene.office_normal_mode

      # Unmute smart speakers
      - service: media_player.volume_mute
        target:
          entity_id: media_player.office_speaker
        data:
          is_volume_muted: false
```

### Node-RED

Process Teams status in Node-RED workflows:

```json
[
  {
    "id": "mqtt-teams",
    "type": "mqtt in",
    "topic": "teams/status",
    "name": "Teams Status",
    "server": "mqtt-broker",
    "datatype": "json",
    "wires": [["switch-status"]]
  },
  {
    "id": "switch-status",
    "type": "switch",
    "name": "Route by Status",
    "property": "payload.status",
    "rules": [
      { "t": "eq", "v": "busy", "vt": "str" },
      { "t": "eq", "v": "available", "vt": "str" },
      { "t": "eq", "v": "do_not_disturb", "vt": "str" }
    ],
    "wires": [
      ["handle-busy"],
      ["handle-available"],
      ["handle-dnd"]
    ]
  },
  {
    "id": "handle-busy",
    "type": "function",
    "name": "Meeting Started",
    "func": "msg.payload = { device: 'office_light', state: 'red' };\nreturn msg;",
    "wires": [["mqtt-out"]]
  }
]
```

### MQTT Dashboard Integration

Use any MQTT dashboard tool (MQTT Explorer, HiveMQ Web Client, etc.) to visualize your Teams status in real-time.

## Testing & Troubleshooting

### Testing with Mosquitto

**1. Start a local broker** (for testing):

```bash
mosquitto -v
```

**2. Subscribe to status topic**:

```bash
mosquitto_sub -h localhost -t "teams/status" -v
```

**3. Change your Teams status** and watch for messages in the subscriber terminal.

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
- Test connectivity: `telnet broker-ip 1883`
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

**Symptoms**: Messages are published but status is always "unknown"

**Solutions**:
- This may occur if Teams UI structure has changed
- Increase `statusCheckInterval` for more frequent polling: `"statusCheckInterval": 5000`
- Check browser console (DevTools) for JavaScript errors
- Report the issue on [GitHub Issues](https://github.com/IsmaelMartinez/teams-for-linux/issues) with Teams version info

### Debug Logging

Enable debug logging to see detailed MQTT activity:

**Via config.json**:
```json
{
  "logConfig": {
    "level": "debug"
  }
}
```

**Via command line**:
```bash
teams-for-linux --logConfig='{"level":"debug"}'
```

Check logs for MQTT-related messages:
- Connection attempts and results
- Status change detections
- Publish confirmations
- Error details

## Security Considerations

### Broker Security

- **Use Authentication**: Always configure username/password for production brokers
- **Enable TLS**: Use `mqtts://` URLs for encrypted connections
- **Restrict Topic Access**: Configure broker ACLs to limit publish/subscribe permissions
- **Firewall Rules**: Only allow necessary network access to broker ports

### Password Storage

Passwords in `config.json` are stored in plain text. For better security:

1. Use file permissions to protect config files:
   ```bash
   chmod 600 ~/.config/teams-for-linux/config.json
   ```

2. Consider using a dedicated MQTT user with minimal permissions

3. For enterprise deployments, use system-wide config at `/etc/teams-for-linux/config.json` with appropriate file permissions

### Network Isolation

For home automation setups:
- Run MQTT broker on a separate VLAN if possible
- Use firewall rules to restrict access
- Monitor broker logs for unusual activity

## Architecture Details

### How It Works

The MQTT integration uses a multi-layer architecture:

```mermaid
graph TB
    subgraph Browser Process
        A[Teams Web UI] --> B[MutationObserver]
        A --> C[Polling Monitor]
        B --> D[Status Detector]
        C --> D
    end

    subgraph Main Process
        E[IPC Handler] --> F[MQTT Client]
        F --> G[MQTT Broker]
    end

    D -->|IPC: user-status-changed| E

    style D fill:#e3f2fd
    style F fill:#fff3e0
    style G fill:#e8f5e9
```

### Status Detection Strategy

The implementation uses a **dual-layer detection approach** for maximum reliability:

#### 1. MutationObserver (Primary)

- Watches for real-time DOM changes in the Teams interface
- Monitors status-related attributes: `class`, `aria-label`, `title`, `data-testid`
- 300ms debouncing prevents excessive checks during UI animations
- Provides instant updates when Teams status changes
- Location: `app/browser/tools/mqttStatusMonitor.js`

#### 2. Polling (Fallback)

- Periodic checks ensure status is detected even if DOM events are missed
- Default interval: 10 seconds (configurable via `statusCheckInterval`)
- Handles cases where MutationObserver might not fire
- Provides redundancy for UI structure changes

#### 3. Multiple Selector Strategies

The status detector tries multiple CSS selector patterns to locate status information, making it resilient to Teams UI updates:

- Profile button status attributes
- Avatar status indicators
- Presence badges
- ARIA labels and accessibility attributes

### IPC Communication

Status changes flow from browser to main process:

1. **Browser-side**: `mqttStatusMonitor.js` detects status change
2. **IPC Channel**: Sends message via `user-status-changed` channel
3. **Main Process**: `app/index.js` receives status and forwards to MQTT client
4. **MQTT Client**: `app/mqtt/index.js` publishes to broker

### Message Lifecycle

1. Status change detected in browser process
2. Deduplicated (only publish if different from last status)
3. Sent via IPC to main process
4. Published to MQTT broker with QoS 1 and retain flag
5. Broker distributes to all subscribers
6. Message persists for new subscribers (retain flag)

## Advanced Configuration

### Custom Topic Hierarchy

Create a more detailed topic structure:

```json
{
  "mqtt": {
    "enabled": true,
    "brokerUrl": "mqtt://broker:1883",
    "topicPrefix": "home/office/desktop",
    "statusTopic": "teams/status"
  }
}
```

Messages will be published to: `home/office/desktop/teams/status`

### High-Frequency Polling

For near-instant status detection (at the cost of higher CPU usage):

```json
{
  "mqtt": {
    "enabled": true,
    "statusCheckInterval": 2000
  }
}
```

### Multiple Instances

When running multiple Teams instances (work/personal profiles), use different `clientId` and topic configurations:

**Work profile** (`~/.config/teams-for-linux-work/config.json`):
```json
{
  "mqtt": {
    "enabled": true,
    "brokerUrl": "mqtt://broker:1883",
    "clientId": "teams-work",
    "topicPrefix": "teams/work",
    "statusTopic": "status"
  }
}
```

**Personal profile** (`~/.config/teams-for-linux-personal/config.json`):
```json
{
  "mqtt": {
    "enabled": true,
    "brokerUrl": "mqtt://broker:1883",
    "clientId": "teams-personal",
    "topicPrefix": "teams/personal",
    "statusTopic": "status"
  }
}
```

## Use Case Examples

### Office Availability Sign

Build a physical "Available/Busy" sign using an ESP8266 and WS2812B LED strip:

```cpp
// Arduino/ESP8266 code snippet
void callback(char* topic, byte* payload, unsigned int length) {
  DynamicJsonDocument doc(1024);
  deserializeJson(doc, payload, length);

  String status = doc["status"];

  if (status == "available") {
    setLEDColor(0, 255, 0);  // Green
  } else if (status == "busy" || status == "do_not_disturb") {
    setLEDColor(255, 0, 0);  // Red
  } else if (status == "away") {
    setLEDColor(255, 255, 0);  // Yellow
  }
}
```

### Slack Status Sync

Synchronize your Teams status to Slack using Node-RED or a custom script:

```python
# Python example using paho-mqtt
import paho.mqtt.client as mqtt
import requests
import json

SLACK_TOKEN = "xoxb-your-token"
SLACK_API = "https://slack.com/api/users.profile.set"

def on_message(client, userdata, msg):
    data = json.loads(msg.payload)
    status = data['status']

    # Map Teams status to Slack status
    status_map = {
        'available': {'emoji': ':white_check_mark:', 'text': 'Available'},
        'busy': {'emoji': ':red_circle:', 'text': 'In a meeting'},
        'do_not_disturb': {'emoji': ':no_entry:', 'text': 'Do not disturb'},
        'away': {'emoji': ':zzz:', 'text': 'Away'}
    }

    if status in status_map:
        profile = {
            'status_text': status_map[status]['text'],
            'status_emoji': status_map[status]['emoji']
        }

        requests.post(SLACK_API,
            headers={'Authorization': f'Bearer {SLACK_TOKEN}'},
            json={'profile': profile}
        )

client = mqtt.Client()
client.on_message = on_message
client.connect("broker", 1883)
client.subscribe("teams/status")
client.loop_forever()
```

### Grafana Dashboard

Monitor team availability over time by storing status changes in InfluxDB and visualizing in Grafana:

1. Use Telegraf MQTT Consumer input plugin
2. Configure InfluxDB as data source
3. Create time-series dashboard showing status distribution
4. Build availability reports and analytics

## Related Documentation

- **[Configuration Guide](configuration.md)** - Complete configuration options
- **[Multiple Instances](multiple-instances.md)** - Running work/personal profiles
- **[IPC API Reference](development/ipc-api.md)** - Inter-process communication details
- **[Troubleshooting](troubleshooting.md)** - Common issues and solutions

## References

- [MQTT.org](https://mqtt.org/) - MQTT protocol specification
- [Mosquitto](https://mosquitto.org/) - Popular open-source MQTT broker
- [Home Assistant MQTT Integration](https://www.home-assistant.io/integrations/mqtt/)
- [Node-RED MQTT nodes](https://flows.nodered.org/node/node-red-contrib-mqtt-broker)
