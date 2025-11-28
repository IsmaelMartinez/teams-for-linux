# Research: MQTT Commands Implementation

**Date:** 2025-11-16
**Status:** ✅ Implemented
**Implementation Date:** 2025-11-25
**Related ADRs:** [CLI Argument Parsing (ADR-006)](../adr/006-cli-argument-parsing-library.md), [Embedded MQTT Broker (ADR-007)](../adr/007-embedded-mqtt-broker.md)

---

## Implementation Status

**✅ Completed** - Initial implementation deployed with the following features:
- Command reception via MQTT with JSON validation
- Three actions supported: `toggle-mute`, `toggle-video`, `toggle-hand-raise`
- Security: action whitelist, JSON validation
- Event-based architecture for clean separation of concerns
- Comprehensive documentation and testing examples

See [MQTT Integration Documentation](../../mqtt-integration.md) for user guide.

---

## Summary

Add bidirectional MQTT support to allow external systems (keyboard shortcuts, home automation) to send action commands to Teams for Linux.

**Previous state:** Teams publishes status → MQTT (one-way)
**Current state:** Teams publishes status + receives commands ← MQTT (two-way) ✅

---

## Motivation

Users want to trigger Teams actions via system-wide keyboard shortcuts (Gnome, KDE, etc.) without:
- Installing separate automation tools
- Complex CLI argument parsing
- Risk of breaking existing functionality

### Use Cases

1. **System Keyboard Shortcuts** - Bind `Super+M` to toggle mute
2. **Home Automation** - Mute Teams when doorbell rings
3. **Stream Deck Integration** - Hardware buttons for Teams control
4. **Accessibility** - Alternative input methods for users with disabilities

---

## Why MQTT?

### Advantages

1. **Infrastructure exists** - 80% of code already implemented (MQTT client for status publishing)
2. **User familiarity** - Users already running MQTT for status monitoring know the system
3. **Clean architecture** - No interference with CLI args, meeting links, or config parsing
4. **Extensible** - JSON message format supports complex commands with parameters
5. **Low risk** - Isolated changes, no modifications to critical code paths
6. **Cross-platform** - Works on Linux, Windows, macOS

### Comparison with Alternatives

| Approach | Setup Time | Risk | Extensibility | External Dependencies |
|----------|-----------|------|---------------|---------------------|
| **MQTT** | 10 min | Low | Excellent | MQTT broker (user provides) |
| CLI args | 0 min | High | Limited | None |
| D-Bus | 15 min | Medium | Good | None (Linux only, blocked in Flatpak/Snap) |
| HTTP | 5 min | Low | Good | None (curl pre-installed) |

---

## Architecture

### Message Flow

```
External Trigger (Gnome shortcut, Home Assistant, etc.)
    ↓
mosquitto_pub -t teams/command -m '{"action":"toggle-mute"}'
    ↓
MQTT Broker (user's localhost or Home Assistant)
    ↓
Teams MQTT Client (subscribes to teams/command)
    ↓
Main Process (validates, executes action)
    ↓
Keyboard Event → Teams Web UI
```

### Topics

- **Subscribe:** `teams/command` - Incoming action commands
- **Publish:** `teams/status` - Outgoing status updates (existing)
- **Publish:** `teams/command/ack` - Acknowledgments (optional)

### Message Format

**Command:**
```json
{
  "action": "toggle-mute",
  "timestamp": "2025-11-16T14:30:00Z",
  "requestId": "abc123"
}
```

**Acknowledgment (optional):**
```json
{
  "action": "toggle-mute",
  "success": true,
  "timestamp": "2025-11-16T14:30:01Z",
  "requestId": "abc123"
}
```

---

## Implementation

### Required Changes

**1. Export Keyboard Event Function** (`app/globalShortcuts/index.js`)
```javascript
module.exports = { register, sendKeyboardEventToWindow };
```
- **Lines:** 1
- **Risk:** Zero (just export)

**2. Add Command Subscription** (`app/mqtt/index.js`)
```javascript
this.client.on('message', (topic, message) => {
  if (topic === commandTopic) {
    this.handleCommand(message.toString());
  }
});

handleCommand(messageString) {
  const command = JSON.parse(messageString);
  if (command.action) {
    this.emit('command', command);
  }
}
```
- **Lines:** ~30
- **Risk:** Low (isolated addition)

**3. Execute Commands** (`app/index.js`)
```javascript
mqttClient.on('command', (command) => {
  const shortcuts = {
    'toggle-mute': 'Ctrl+Shift+M',
    'toggle-video': 'Ctrl+Shift+O',
    'toggle-hand-raise': 'Ctrl+Shift+K',
  };

  const shortcut = shortcuts[command.action];
  if (shortcut) {
    sendKeyboardEventToWindow(window, shortcut);
  }
});
```
- **Lines:** ~25
- **Risk:** Low (new event handler)

**4. Update Config Schema** (`app/config/index.js`)
```javascript
mqtt: {
  default: {
    // ... existing ...
    commandTopic: "command",  // NEW
  }
}
```
- **Lines:** 1
- **Risk:** Zero (backward compatible)

### Total Implementation Effort

| Task | Effort | Risk |
|------|--------|------|
| Export keyboard function | 5 min | Zero |
| Add MQTT subscription | 1.5 hours | Low |
| Add command execution | 1.5 hours | Low |
| Update config schema | 5 min | Zero |
| Update documentation | 1 hour | Zero |
| Testing | 1 hour | Low |
| **Total** | **4-6 hours** | **Low** |

---

## User Experience

### Setup (10 minutes)

**1. User configures Teams:**
```json
{
  "mqtt": {
    "enabled": true,
    "brokerUrl": "mqtt://localhost:1883"
  }
}
```

**2. User creates wrapper script:**
```bash
#!/bin/bash
# ~/.local/bin/teams-toggle-mute
mosquitto_pub -h localhost -t teams/command -m '{"action":"toggle-mute"}' -q 1
```

**3. User binds Gnome shortcut:**
- Settings → Keyboard → Custom Shortcuts
- Command: `teams-toggle-mute`
- Shortcut: `Super+M`

### Supported Actions (Phase 1)

- `toggle-mute` - Ctrl+Shift+M
- `toggle-video` - Ctrl+Shift+O
- `toggle-hand-raise` - Ctrl+Shift+K

Easy to extend with more Teams keyboard shortcuts.

---

## Security Considerations

### Threats

1. **Command Injection** - Malicious MQTT messages trigger unwanted actions
2. **Privacy** - Status data visible on network if broker exposed
3. **Credential Exposure** - MQTT password in plain text config file

### Mitigations

1. **Use localhost broker (default)**
   - `brokerUrl: "mqtt://localhost:1883"`
   - No network exposure
   - No authentication needed

2. **Validate commands**
   - Whitelist of allowed actions
   - JSON schema validation

3. **File permissions**
   - Document `chmod 600 config.json`
   - Warn about password storage

4. **Security warnings in docs**
   - Never use public MQTT brokers for production
   - Use TLS for network brokers
   - Document authentication setup

---

## Broker Recommendations

### For Most Users: Localhost Mosquitto

```bash
sudo apt-get install mosquitto mosquitto-clients
sudo systemctl enable mosquitto
```

**Pros:**
- Maximum privacy (localhost only)
- Maximum security (no network exposure)
- Zero cost
- Low latency

### For Home Assistant Users: HA MQTT Add-on

1. Home Assistant → Add-ons → MQTT
2. Install → Start
3. Configure Teams: `brokerUrl: "mqtt://homeassistant.local:1883"`

**Pros:**
- One-click install
- Already integrated with home automation
- Users already familiar

### NOT Recommended: Embedded Broker

See [ADR-007: Embedded MQTT Broker](../adr/007-embedded-mqtt-broker.md)

**Reason:** Users still need `mosquitto_pub` to send commands, so embedding broker doesn't eliminate external dependencies. Better alternatives exist (HTTP server for zero-dependency shortcuts).

---

## Future Enhancements

### Phase 2 (Optional)

- **Acknowledgments** - Publish success/failure to `teams/command/ack`
- **More actions** - Support all Teams keyboard shortcuts
- **Parameterized commands** - Set custom status, join meeting by ID
- **State queries** - Request current mute state, meeting status

### Phase 3 (Optional)

- **HTTP command server** - Zero external dependencies (curl pre-installed)
- **Web UI** - Browser-based control panel
- **WebSocket** - Real-time bidirectional communication

---

## Decision

**Proceed with MQTT commands implementation.**

### Rationale

1. Low effort (4-6 hours)
2. Low risk (isolated changes)
3. High value (enables keyboard shortcuts, home automation)
4. Leverages existing infrastructure (MQTT client)
5. Extensible architecture (easy to add more actions)

### Next Steps

1. Implement command subscription in MQTT client
2. Add action execution in main process
3. Update configuration schema
4. Document user setup (broker installation, wrapper scripts, shortcuts)
5. Create example scripts for common actions

---

## References

- Current MQTT implementation: `app/mqtt/index.js`, `app/mqtt/README.md`
- MQTT integration docs: `docs-site/docs/mqtt-integration.md`
- Global shortcuts: `app/globalShortcuts/index.js`
