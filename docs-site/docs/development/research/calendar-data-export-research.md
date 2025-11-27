# Calendar Data Export Research

**Issue**: [#1995](https://github.com/IsmaelMartinez/teams-for-linux/issues/1995)
**Related**: [#1832 - Graph API Integration](https://github.com/IsmaelMartinez/teams-for-linux/issues/1832)
**Status**: Research Phase
**Date**: 2025-11-27

## Overview

User needs access to calendar data from Teams for Linux to process externally (e.g., convert to org-mode). This research investigates how to expose calendar data with minimal internal logic.

## Problem Statement

User wants to:
1. Access their Teams calendar data programmatically
2. Process it externally (org-mode conversion, etc.)
3. Avoid maintaining separate authentication scripts (2FA expires daily)

**Key insight:** Since they log into Teams for Linux daily anyway, the app can expose calendar data using existing authentication.

## Current State

### ✅ Already Implemented

Teams for Linux has Graph API integration (Phase 1 complete):

- **GraphApiClient** in `app/graphApi/`
- **Calendar endpoints** functional:
  - `GET /me/calendar/events` - All events
  - `GET /me/calendar/calendarView` - Date range filtered
- **IPC channels** available:
  - `graph-api-get-calendar-events`
  - `graph-api-get-calendar-view`

**User can already access calendar data today** via IPC calls (just needs documentation).

## Recommended Architecture

### Philosophy: Minimal Internal Logic

**What Teams for Linux should do:**
- ✅ Expose calendar data via MQTT command
- ✅ Return raw Graph API JSON
- ✅ React to `get-calendar` command

**What Teams for Linux should NOT do:**
- ❌ Format conversion (org-mode, CSV, etc.)
- ❌ Internal scheduling/polling
- ❌ Complex data transformation
- ❌ File management logic

**Let the user handle:** All formatting, scheduling, and processing externally.

### Architectural Constraints

Per [ADR-006](../adr/006-cli-argument-parsing-library.md):
- ❌ **Cannot add CLI action commands** (e.g., `teams-for-linux --get-calendar`)
  - Conflicts with meeting URL positional arguments
  - Would require fragile pre-parsing
  - High risk of breaking existing functionality

**Chosen approach:**
- ✅ MQTT commands (already used for actions like toggle-mute, toggle-video, etc.)

## Implementation: MQTT Command

**Decision:** MQTT command approach (leverages existing MQTT infrastructure per [MQTT Commands Implementation](mqtt-commands-implementation.md)).

**User triggers export via MQTT command:**

```bash
# User sends command to get calendar
mosquitto_pub -h localhost -t teams/command -m '{
  "action": "get-calendar",
  "days": 7
}'
```

**Teams publishes calendar data to response topic:**

```bash
# Teams publishes to teams/calendar topic
# User subscribes and pipes to their processor
mosquitto_sub -h localhost -t teams/calendar | python3 ~/to_orgmode.py
```

**Architecture:**

```mermaid
graph LR
    A[User Script/Cron] --> B[MQTT Pub: teams/command]
    B --> C[Teams for Linux]
    C --> D[Graph API Client]
    D --> E[Microsoft Graph]
    E --> D
    D --> C
    C --> F[MQTT Pub: teams/calendar]
    F --> G[User Subscribes]
    G --> H[User's Processor]
    H --> I[Org-mode/CSV/etc]
```

**Implementation:**

```javascript
// app/mqtt/index.js - Add command handler
async handleCommand(message) {
  const command = JSON.parse(message);

  if (command.action === 'get-calendar') {
    const days = command.days || 7;
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + days);

    const result = await this.graphApiClient.getCalendarView(
      startDate.toISOString(),
      endDate.toISOString()
    );

    // Publish raw Graph API JSON
    this.client.publish('teams/calendar', JSON.stringify(result));
  }
}
```

**User workflow:**

```bash
# 1. User creates script to request calendar
#!/bin/bash
mosquitto_pub -h localhost -t teams/command -m '{"action":"get-calendar","days":7}'

# 2. User subscribes and processes
mosquitto_sub -h localhost -t teams/calendar -C 1 | python3 ~/to_orgmode.py > calendar.org

# 3. User schedules with cron
0 6 * * * /home/user/scripts/fetch-calendar.sh
```

**Pros:**
- ✅ Follows established MQTT pattern (ADR-006, ADR-007)
- ✅ Minimal code changes (~20 lines)
- ✅ Integrates with home automation
- ✅ Event-driven (no internal scheduling)
- ✅ User controls everything externally

**Cons:**
- ⚠️ Requires MQTT broker (but many users already have one)
- ⚠️ Slightly more setup than direct IPC

**Estimated effort:** 2-3 hours

## Data Format

**Return exactly what Graph API returns:**

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
          "joinUrl": "https://teams.microsoft.com/l/meetup/..."
        }
      }
    ]
  }
}
```

**User converts externally** with their own script (Python, shell, whatever).

## Implementation Steps

1. Add `get-calendar` command to MQTT command handler
2. Validate command parameters (days, date range)
3. Fetch from Graph API
4. Publish raw JSON to `teams/calendar` topic
5. Document MQTT workflow
6. Provide example scripts (Python converter to org-mode)

**Estimated effort:** 2-3 hours

## Questions for User

### 1. Date Range ⭐

**What date range should be retrieved?**

- [ ] Next N days (specify: ___)
- [ ] I'll specify start/end dates each time as command parameters
- [ ] Doesn't matter, make it configurable
- [ ] Other: ___________

### 2. Your Processing Workflow

**What will you do with the JSON data?**

Example:
> "I'll run a cron job at 6am that sends MQTT command to get next 7 days. I subscribe to teams/calendar topic and pipe to my Python script that converts to org-mode and saves to ~/org/calendar.org. Emacs reads that file."

Your workflow:
```
[Describe briefly]
```

### 3. Scheduling

**How will you schedule/trigger this?**

- [ ] Manual (I'll run command when I need it)
- [ ] Cron job (I'll set up)
- [ ] Systemd timer (I'll set up)
- [ ] Home automation system (I'll set up)
- [ ] Other: ___________

## Implementation Risk

**Low risk:**
- ✅ Minimal code changes (~20 lines for MQTT)
- ✅ Uses existing Graph API client
- ✅ Uses existing MQTT infrastructure
- ✅ No complex logic
- ✅ User controls everything

## Success Criteria

1. User can retrieve calendar data as JSON via MQTT command
2. Data includes all Graph API fields
3. User can process output with their own tools
4. No internal formatting/transformation logic
5. No internal scheduling (user controls when to fetch)

## References

- [Issue #1995](https://github.com/IsmaelMartinez/teams-for-linux/issues/1995)
- [ADR-006: CLI Argument Parsing](../adr/006-cli-argument-parsing-library.md) - Why CLI commands are rejected
- [ADR-007: Embedded MQTT Broker](../adr/007-embedded-mqtt-broker.md) - MQTT architecture decisions
- [MQTT Commands Implementation](mqtt-commands-implementation.md) - Existing MQTT command pattern
- [Microsoft Graph Calendar API](https://learn.microsoft.com/en-us/graph/api/resources/calendar)
- [Existing Graph API Integration](graph-api-integration-research.md)
