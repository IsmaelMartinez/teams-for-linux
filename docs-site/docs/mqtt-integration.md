# MQTT Integration

:::info Feature Status
This feature is **disabled by default**. You must explicitly enable it in your configuration.
:::

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

:::note WebSocket Support
While the underlying mqtt.js library supports WebSocket URLs (`ws://` and `wss://`), these have not been tested with Teams for Linux. If you successfully use WebSocket connections, please share your experience on [GitHub Issues](https://github.com/IsmaelMartinez/teams-for-linux/issues) or in our [Matrix chat](https://matrix.to/#/#teams-for-linux_community:gitter.im).
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

## Home Automation Integration

The MQTT integration has been tested with various home automation platforms. However, specific automation configurations vary based on your setup and requirements.

### Share Your Automations

If you've successfully integrated Teams for Linux with your home automation system, **please share your configurations** to help other users:

- **[GitHub Issues](https://github.com/IsmaelMartinez/teams-for-linux/issues)** - Tag as enhancement and share your automation scripts
- **[Matrix Chat](https://matrix.to/#/#teams-for-linux_community:gitter.im)** - Discuss and share configurations with the community
- **Supported Platforms**: Home Assistant, Node-RED, n8n, openHAB, Domoticz, and others
- **What to Share**:
  - YAML configurations for Home Assistant
  - Flow exports for Node-RED/n8n
  - Example use cases (busy lights, notification routing, etc.)
  - Hardware integrations (ESP32, Raspberry Pi projects, etc.)

### Integration Ideas

Common automation scenarios include:
- **Status Lights**: Change LED colors based on availability (red=busy, green=available)
- **Do Not Disturb Signs**: Physical "On Air" signs for home offices
- **Smart Home Scenes**: Adjust lighting, mute speakers during calls
- **Notification Routing**: Silence phone notifications when in meetings
- **Calendar Integration**: Sync status with other calendar systems
- **Dashboards**: Display team availability in Grafana, MQTT Explorer, or custom dashboards

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
- Decrease `statusCheckInterval` for more frequent polling: `"statusCheckInterval": 5000`
- Check browser console (DevTools) for JavaScript errors
- Report the issue on [GitHub Issues](https://github.com/IsmaelMartinez/teams-for-linux/issues) with Teams version info

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
