---
id: 007-embedded-mqtt-broker
---

# ADR 007: Embedded MQTT Broker Decision

## Status

Rejected

## Context

With MQTT commands implementation planned, we evaluated whether to bundle an embedded MQTT broker (Aedes) in the Electron app to simplify user setup.

### Problem

Users need an MQTT broker to:
1. Receive status updates from Teams
2. Send action commands to Teams

Without a broker, users must:
- Install mosquitto: `sudo apt-get install mosquitto`
- Configure and start the service
- Understand MQTT concepts

### Proposed Solution

Bundle Aedes (JavaScript MQTT broker) in the Electron app:
- Auto-starts when app launches
- Listens on `localhost:1883`
- Zero configuration needed
- Bundle size: +230 KB
- Implementation effort: 6-8 hours

---

## Decision

**Do NOT bundle an embedded MQTT broker.**

---

## Rationale

### 1. Doesn't Solve the Real Problem

**Users still need MQTT client tools** to send commands:

```bash
# Even with embedded broker, users must install:
sudo apt-get install mosquitto-clients

# To run:
mosquitto_pub -h localhost -t teams/command -m '{"action":"toggle-mute"}'
```

**Embedded broker eliminates:**
- Installing mosquitto broker

**Embedded broker does NOT eliminate:**
- Installing mosquitto-clients (for `mosquitto_pub`)
- Creating wrapper scripts
- Understanding MQTT topics

**Conclusion:** Marginal benefit (removes 1 of 3 installation steps)

---

### 2. Wrong Architectural Pattern

**Teams should be a client, not a broker.**

```
❌ Wrong: Each Teams instance runs its own broker
    Teams Instance 1 → Aedes broker :1883
    Teams Instance 2 → Aedes broker :1884 (port conflict!)
    Home Assistant → Mosquitto :1883
    → Fragmented ecosystem

✅ Right: Centralized broker, multiple clients
    Mosquitto :1883 (or Home Assistant MQTT add-on)
        ├─ Teams for Linux (client)
        ├─ Home Assistant (client)
        ├─ Node-RED (client)
        └─ IoT devices (clients)
    → Unified ecosystem
```

Users with home automation already have MQTT brokers. Creating another broker fragments their setup.

---

### 3. Implementation Complexity Without Value

| Component | Embedded Broker | External Broker | HTTP Server |
|-----------|----------------|-----------------|-------------|
| Bundle size | +230 KB | 0 KB | 0 KB |
| Implementation | 6-8 hours | 0 hours | 3-4 hours |
| User dependencies | mosquitto-clients | mosquitto + mosquitto-clients | None (curl) |
| Port conflicts | Yes (need handling) | No | Rare |
| Maintenance | Update Aedes | User manages | None |

**Cost/benefit:** Not favorable

---

## Consequences

### Positive
- ✅ Simpler architecture (Teams = client only)
- ✅ No port conflict handling needed
- ✅ No Aedes dependency to maintain
- ✅ Users with existing MQTT get better integration
- ✅ Saved 6-8 hours implementation effort

### Negative
- ⚠️ Users without MQTT must install mosquitto
- ⚠️ Slightly higher barrier to entry for MQTT features

### Mitigations
- Document easy broker setup (apt-get one-liner for most distros)
- Recommend Home Assistant MQTT add-on (one-click install)
- Consider HTTP server as zero-dependency alternative (future)

---

## Alternatives Considered

### Alternative 1: HTTP Command Server (Future)

**For users wanting to send commands without MQTT:**

```javascript
// Serve HTTP endpoint
http://localhost:48765/action/toggle-mute

// User script (no dependencies)
curl -X POST http://localhost:48765/action/toggle-mute
```

**Advantages:**
- ✅ curl is pre-installed
- ✅ Simpler than MQTT for basic use
- ✅ Can add web UI later

**Status:** Consider for future implementation

### Alternative 2: Keep MQTT, Document Broker Setup

**For users with home automation:**

Document connecting to existing brokers:
- Home Assistant MQTT add-on
- Existing mosquitto installation
- Cloud MQTT providers (for advanced users)

**Status:** Accepted (current plan)

---

## User Segments

### Segment 1: Home Automation Users (30%)
- Already have MQTT broker
- Want Teams integration with automations
- **Solution:** Connect to existing broker (documented)

### Segment 2: Command Integration Users (50%)
- Want to send commands from external systems
- Don't have MQTT infrastructure
- **Solution:** Install mosquitto (documented) OR HTTP server (future)

### Segment 3: Advanced Users (20%)
- Can set up whatever they need
- **Solution:** Any approach works

---

## References

- [Aedes MQTT Broker](https://github.com/moscajs/aedes)
- Related: HTTP command server (future consideration)

---

## Review

This decision should be reviewed if:
1. MQTT adoption is very low due to broker installation complexity
2. Implementation effort for embedded broker drops significantly (new library, etc.)

For now: **Proceed with MQTT client only + document broker setup.**
