# Calendar Export - User Questions

**Related Issue**: [#1995](https://github.com/IsmaelMartinez/teams-for-linux/issues/1995)
**Research Document**: [calendar-data-export-research.md](calendar-data-export-research.md)
**Date**: 2025-11-27

## Simple Approach

Teams for Linux will:
- ✅ Give you raw calendar data as JSON (exactly what Microsoft Graph API returns)
- ✅ Provide a way to trigger retrieval (MQTT command or IPC)
- ❌ NOT do any formatting, conversion, or processing

**You handle everything else externally** - format conversion, scheduling, file management, etc.

## 4 Simple Questions

### 1. How do you want to get the data? ⭐

**Pick your preferred trigger method:**

- [ ] **MQTT command** (recommended)
  - Send: `mosquitto_pub -t teams/command -m '{"action":"get-calendar","days":7}'`
  - Receive: Subscribe to `teams/calendar` topic, pipe to your processor
  - Can be scheduled with cron
  - Integrates with home automation
  - **Requires:** MQTT broker (mosquitto)

- [ ] **IPC** (already works, just needs documentation)
  - Call existing `graph-api-get-calendar-view` IPC channel
  - No broker needed
  - **Requires:** Node.js/Electron tooling

- [ ] **Don't care** - Implement both, I'll choose later

**Note:** CLI commands (e.g., `teams-for-linux --get-calendar`) are not possible due to architectural constraints (see [ADR-006](../adr/006-cli-argument-parsing-library.md)).

### 2. What date range? ⭐

**What calendar range should be retrieved?**

- [ ] Next N days (specify N: ___)
- [ ] I'll specify start/end dates each time as command parameters
- [ ] Don't care, make it configurable
- [ ] Other: ___________

### 3. Your workflow?

**Briefly describe what you'll do with the JSON data:**

Example:
> "I'll run a cron job at 6am that sends MQTT command: `mosquitto_pub -t teams/command -m '{"action":"get-calendar","days":7}'`. I have another script that subscribes to `teams/calendar` topic and pipes output to my Python script: `mosquitto_sub -t teams/calendar | python3 ~/to_orgmode.py > ~/org/calendar.org`. Emacs reads that file."

Your workflow:
```
[Describe here]
```

### 4. Scheduling?

**How will you trigger the data retrieval?**

- [ ] Manual (I'll run command when I need it)
- [ ] Cron job (I'll set up)
- [ ] Systemd timer (I'll set up)
- [ ] Home automation system (I'll set up)
- [ ] Other: ___________

## Example: MQTT Workflow

**1. User sends command:**
```bash
mosquitto_pub -h localhost -t teams/command -m '{"action":"get-calendar","days":7}'
```

**2. Teams for Linux receives command, fetches calendar, publishes to `teams/calendar` topic**

**3. User subscribes and processes:**
```bash
mosquitto_sub -h localhost -t teams/calendar -C 1 | python3 ~/my_processor.py
```

**4. User's Python script converts to org-mode:**
```python
#!/usr/bin/env python3
import json
import sys

data = json.load(sys.stdin)
for event in data['data']['value']:
    print(f"* {event['subject']}")
    print(f"  SCHEDULED: <{event['start']['dateTime']}>")
    print(f"  Location: {event['location']['displayName']}")
    print()
```

## Example JSON Output

**This is what you'll get (raw Microsoft Graph API format):**

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
        "attendees": [
          {
            "emailAddress": {
              "name": "Jane Smith",
              "address": "jane@example.com"
            },
            "type": "required"
          }
        ],
        "bodyPreview": "Meeting description...",
        "onlineMeeting": {
          "joinUrl": "https://teams.microsoft.com/l/meetup/..."
        }
      }
    ]
  }
}
```

**You parse this JSON and convert to whatever format you want** (org-mode, CSV, whatever).

## That's It!

Answer those 4 questions and we're good to go. Implementation is probably 2-3 hours for MQTT, or 0 hours for IPC (just documentation).

## Next Steps

Once you answer:
1. We implement the MQTT command handler (if you choose MQTT)
2. We document the IPC approach (if you choose IPC)
3. You write your external processing script
4. Done!

---

**Philosophy:** Teams for Linux is just a bridge to Microsoft's calendar API. All the interesting logic (formatting, processing, scheduling) lives in your scripts where you have full control.
