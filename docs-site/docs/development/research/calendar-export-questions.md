# Calendar Export - User Questions

**Related Issue**: [#1995](https://github.com/IsmaelMartinez/teams-for-linux/issues/1995)
**Research Document**: [calendar-data-export-research.md](calendar-data-export-research.md)
**Date**: 2025-11-27

## Simple Approach

Teams for Linux will:
- ✅ Give you raw calendar data as JSON (exactly what Microsoft Graph API returns)
- ✅ Provide MQTT command to trigger retrieval
- ❌ NOT do any formatting, conversion, or processing

**You handle everything else externally** - format conversion, scheduling, file management, etc.

## Implementation: MQTT Command

**Trigger:** Send MQTT command `get-calendar`
**Response:** Teams publishes raw JSON to `teams/calendar` topic
**Processing:** You subscribe and pipe to your own converter

## 3 Quick Questions

### 1. Date Range ⭐

**What calendar range should be retrieved?**

- [ ] Next N days (specify N: ___)
- [ ] I'll specify start/end dates each time as command parameters
- [ ] Don't care, make it configurable
- [ ] Other: ___________

### 2. Your Workflow ⭐

**Briefly describe what you'll do with the JSON data:**

Example:
> "I'll run a cron job at 6am that sends MQTT command. I have another script that subscribes to `teams/calendar` and pipes output to my Python script that converts to org-mode and saves to `~/org/calendar.org`. Emacs reads that file."

Your workflow:
```
[Describe here]
```

### 3. Scheduling

**How will you trigger the data retrieval?**

- [ ] Manual (I'll run command when I need it)
- [ ] Cron job (I'll set up)
- [ ] Systemd timer (I'll set up)
- [ ] Home automation system (I'll set up)
- [ ] Other: ___________

## MQTT Workflow

**1. User sends command:**
```bash
mosquitto_pub -h localhost -t teams/command -m '{"action":"get-calendar","days":7}'
```

**2. Teams for Linux receives command, fetches calendar from Graph API**

**3. Teams publishes raw JSON to `teams/calendar` topic**

**4. User subscribes and processes:**
```bash
# One-time retrieval
mosquitto_sub -h localhost -t teams/calendar -C 1 | python3 ~/to_orgmode.py > calendar.org

# Or persistent subscriber
mosquitto_sub -h localhost -t teams/calendar | python3 ~/processor.py
```

**5. User's Python script converts to org-mode:**
```python
#!/usr/bin/env python3
import json
import sys

data = json.load(sys.stdin)
for event in data['data']['value']:
    subject = event['subject']
    start = event['start']['dateTime']
    location = event['location']['displayName']

    print(f"* {subject}")
    print(f"  SCHEDULED: <{start}>")
    print(f"  :PROPERTIES:")
    print(f"  :LOCATION: {location}")
    print(f"  :END:")
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

Answer those 3 questions and we're good to go.

**Implementation estimate:** 2-3 hours

## Next Steps

Once you answer:
1. We implement the MQTT `get-calendar` command handler
2. We document the workflow
3. You write your external processing script
4. Done!

---

**Philosophy:** Teams for Linux is just a bridge to Microsoft's calendar API. All the interesting logic (formatting, processing, scheduling) lives in your scripts where you have full control.
