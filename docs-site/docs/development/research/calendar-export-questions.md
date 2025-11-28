# Calendar Export - Implementation Proposal

**Related Issue**: [#1995](https://github.com/IsmaelMartinez/teams-for-linux/issues/1995)
**Research Document**: [calendar-data-export-research.md](calendar-data-export-research.md)
**Date**: 2025-11-27

## What We'll Implement

Add MQTT command `get-calendar` that returns raw Microsoft Graph API calendar JSON.

**Implementation:** ~20 lines in `app/mqtt/index.js`
**Effort:** 2-3 hours

## What You'll Do

### 1. Send MQTT Command to Get Calendar

```bash
mosquitto_pub -h localhost -t teams/command -m '{
  "action": "get-calendar",
  "days": 7
}'
```

### 2. Subscribe to Receive Calendar Data

```bash
# One-time retrieval
mosquitto_sub -h localhost -t teams/calendar -C 1 > calendar.json

# Or persistent subscriber
mosquitto_sub -h localhost -t teams/calendar > calendar.json
```

### 3. Convert to Org-Mode (Your Script)

Create your own converter, e.g., `~/scripts/to_orgmode.py`:

```python
#!/usr/bin/env python3
import json
import sys
from datetime import datetime

# Read JSON from stdin
data = json.load(sys.stdin)

# Convert each event to org-mode
for event in data['data']['value']:
    subject = event['subject']
    start = event['start']['dateTime']
    end = event['end']['dateTime']
    location = event.get('location', {}).get('displayName', 'No location')

    # Format as org-mode
    print(f"* {subject}")
    print(f"  SCHEDULED: <{start[:10]} {start[11:16]}-{end[11:16]}>")
    print(f"  :PROPERTIES:")
    print(f"  :LOCATION: {location}")
    if 'onlineMeeting' in event and event['onlineMeeting']:
        print(f"  :JOIN_URL: {event['onlineMeeting'].get('joinUrl', '')}")
    print(f"  :END:")

    # Add attendees
    if 'attendees' in event and event['attendees']:
        attendees = [a['emailAddress']['name'] for a in event['attendees']]
        print(f"  Attendees: {', '.join(attendees)}")

    print()
```

### 4. Use It

```bash
# Get calendar and convert in one go
mosquitto_pub -t teams/command -m '{"action":"get-calendar","days":7}' && \
mosquitto_sub -t teams/calendar -C 1 | python3 ~/scripts/to_orgmode.py > ~/org/calendar.org
```

### 5. Automate with Cron (Optional)

Create `~/scripts/fetch-calendar.sh`:

```bash
#!/bin/bash
# Request calendar
mosquitto_pub -h localhost -t teams/command -m '{"action":"get-calendar","days":7}'

# Wait a moment for response
sleep 1

# Receive and convert
mosquitto_sub -h localhost -t teams/calendar -C 1 | \
  python3 ~/scripts/to_orgmode.py > ~/org/calendar.org
```

Add to crontab:
```bash
# Fetch calendar every day at 6am
0 6 * * * /home/user/scripts/fetch-calendar.sh
```

## Example Output

**Raw JSON you'll receive:**

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
        "onlineMeeting": {
          "joinUrl": "https://teams.microsoft.com/l/meetup/..."
        }
      }
    ]
  }
}
```

**After your Python script converts it:**

```org
* Team Standup
  SCHEDULED: <2025-11-27 10:00-10:30>
  :PROPERTIES:
  :LOCATION: Teams Meeting
  :JOIN_URL: https://teams.microsoft.com/l/meetup/...
  :END:
  Attendees: Jane Smith
```

## Configuration Options

We'll add support for:

```json
{
  "action": "get-calendar",
  "days": 7                    // Next 7 days (default)
}
```

Or specify exact dates:

```json
{
  "action": "get-calendar",
  "startDate": "2025-11-27",
  "endDate": "2025-12-04"
}
```

## Requirements

**You need:**
- MQTT broker running (mosquitto)
- Graph API enabled in config: `graphApi.enabled: true`
- Teams for Linux running and authenticated

## Does This Work for You?

If yes, we'll implement it. If you want changes to the approach, let us know.
