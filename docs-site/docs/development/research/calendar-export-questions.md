# Calendar Export Feature - Questions for User

**Related Issue**: [#1995](https://github.com/IsmaelMartinez/teams-for-linux/issues/1995)
**Research Document**: [calendar-data-export-research.md](calendar-data-export-research.md)
**Date**: 2025-11-27

## Quick Summary

Based on issue #1995, we're implementing calendar export functionality that:
- ✅ Leverages existing Microsoft Graph API integration
- ✅ Follows event-driven architecture (reacts to events, no internal scheduling)
- ✅ Enables org-mode conversion for personal knowledge management
- ✅ Eliminates need for separate authentication scripts

**Recommended approach:** User-triggered export (Phase 1), with optional external automation support (Phase 2)

## Critical Questions

Please answer these questions to guide implementation:

### 1. Org-mode Format Requirements ⭐ CRITICAL

**What specific org-mode format do you need?**

Please provide an example of your preferred format, or choose from the options below:

**Option A: Org-mode Agenda Format with Properties**
```org
* TODO Meeting Title
  SCHEDULED: <2025-11-27 Wed 14:00-15:00>
  :PROPERTIES:
  :LOCATION: Teams Meeting
  :ORGANIZER: John Doe
  :ATTENDEES: Jane Smith, Bob Johnson
  :MEETING_ID: abc123
  :END:

  Meeting description/notes here
```

**Option B: Simple Headline Format**
```org
* 2025-11-27 Wed 14:00-15:00 Meeting Title
** Location: Teams Meeting
** Organizer: John Doe
** Attendees: Jane Smith, Bob Johnson

Meeting description/notes here
```

**Option C: Compact One-liner**
```org
* <2025-11-27 Wed 14:00-15:00> Meeting Title (with: Jane Smith, Bob Johnson)
```

**Option D: Custom Format**
```org
[Describe your preferred format or provide an example]
```

**Please specify:**
- [ ] Preferred headline structure
- [ ] Include meeting descriptions/notes? (Yes/No)
- [ ] Include attendee lists? (Yes/No)
- [ ] Include meeting organizer? (Yes/No)
- [ ] Include meeting links/join URLs? (Yes/No)
- [ ] Include meeting status (tentative/accepted/declined)? (Yes/No)
- [ ] Date/time format preferences (ISO 8601, locale-specific, custom)
- [ ] Timezone handling (local time, UTC, include timezone info)

### 2. Export Trigger ⭐ CRITICAL

**How do you want to trigger calendar exports?**

Choose all that apply:
- [ ] Manual button/menu item in application
- [ ] Keyboard shortcut (specify: ___________)
- [ ] Automatic on app startup (after Teams loads)
- [ ] Automatic on app shutdown
- [ ] External script/automation tool via IPC
- [ ] Command line interface
- [ ] Other: ___________

**If automatic, specify frequency:**
- [ ] Once per session
- [ ] Every N minutes (specify: ___)
- [ ] On calendar change detection (requires polling)
- [ ] Other: ___________

### 3. Export Date Range ⭐ CRITICAL

**What date range should be exported?**

- [ ] Next N days (specify N: ___)
- [ ] Current week (Monday-Sunday)
- [ ] Current month
- [ ] Custom date range (specify: from ___ to ___)
- [ ] All upcoming events (no end date)
- [ ] Past + future (specify range: ___)
- [ ] Configurable via dialog each time

### 4. File Management

**How should export files be managed?**

- [ ] Overwrite same file each time (latest calendar state)
- [ ] Append to existing file (cumulative)
- [ ] Create dated files (e.g., `calendar-2025-11-27.org`)
- [ ] Create separate files per event
- [ ] Other: ___________

**Preferred output path:**
- [ ] Fixed path (specify: ___________)
- [ ] Configurable in settings
- [ ] Choose via dialog each time
- [ ] Follow XDG Base Directory spec (`$XDG_DATA_HOME` or `~/.local/share/teams-for-linux/`)

### 5. Emacs/Org-mode Integration

**Do you use Emacs? If yes, are there specific integration points we should consider?**

- [ ] I use Emacs with org-mode
- [ ] I use org-agenda for calendar management
- [ ] I use org-capture for meeting notes
- [ ] I would like Emacs to auto-reload the file after export
- [ ] I would like org-mode TODO states for meeting statuses
- [ ] Other integration needs: ___________

**If using org-agenda:**
- [ ] Should exported file be automatically added to `org-agenda-files`?
- [ ] Preferred TODO states for meetings (e.g., TODO for upcoming, DONE for past)?

### 6. Automation/Integration Workflow

**Do you plan to automate exports with external tools?**

- [ ] Yes, with cron/systemd timers
- [ ] Yes, with home automation (Home Assistant, etc.)
- [ ] Yes, with custom scripts
- [ ] Yes, with MQTT (Teams for Linux has MQTT support)
- [ ] No, manual export is sufficient
- [ ] Unsure yet

**If yes, preferred IPC mechanism:**
- [ ] Unix domain socket
- [ ] MQTT commands (leverage existing MQTT feature)
- [ ] HTTP localhost endpoint
- [ ] D-Bus
- [ ] Other: ___________

### 7. Privacy/Filtering

**Should any calendar entries be excluded from export?**

- [ ] Export all events
- [ ] Exclude private/confidential events
- [ ] Exclude declined events
- [ ] Exclude tentative events
- [ ] Exclude events with specific keywords (specify: ___________)
- [ ] Only include accepted events
- [ ] Filter by calendar (if you use multiple calendars)

### 8. Error Handling

**What should happen if export fails?**

- [ ] Show desktop notification with error
- [ ] Write error to log file only (silent failure)
- [ ] Retry N times automatically (specify N: ___)
- [ ] Show error dialog (blocking)
- [ ] Other: ___________

## Optional Enhancements (Future Considerations)

### 9. Additional Data Exports

**Beyond calendar events, would you be interested in exporting:**

- [ ] Tasks/To-Dos from Microsoft To Do
- [ ] Email metadata (subject, sender, date)
- [ ] Teams chat presence status
- [ ] Meeting notes/transcripts (if available via API)
- [ ] Shared files from meetings
- [ ] None of the above

### 10. Export Formats

**Besides org-mode, would you like support for other formats?**

- [ ] JSON (structured data)
- [ ] CSV (spreadsheet import)
- [ ] iCalendar (.ics) format
- [ ] Markdown
- [ ] Plain text
- [ ] Custom format (describe: ___________)
- [ ] Org-mode only is sufficient

### 11. Performance Considerations

**Typical calendar size:**

- [ ] Small (<50 events in typical export range)
- [ ] Medium (50-200 events)
- [ ] Large (200-500 events)
- [ ] Very large (>500 events)
- [ ] Unsure

This helps us optimize pagination and performance.

## Example Scenario

To help clarify your workflow, please describe a typical use case:

```
Example:
"Every morning when I start work, I open Teams for Linux. I want the app to
automatically export my calendar for the next 7 days to ~/org/calendar.org
in org-mode agenda format. This file is included in my org-agenda-files, so
Emacs picks up the changes automatically. I want to see meeting titles, times,
attendees, and join links, but not meeting descriptions (those can be verbose)."
```

**Your workflow:**
```
[Describe your typical workflow here]
```

## Response Instructions

Please copy this file and fill in your answers, or respond with a numbered list:

1. Format: [Your choice - A, B, C, or describe custom]
2. Trigger: [How you want to trigger exports]
3. Date Range: [What range to export]
...etc.

## Next Steps

Once you provide these answers:

1. ✅ We'll create a detailed PRD (Product Requirements Document)
2. ✅ Implement Phase 1 (core export functionality)
3. ✅ Iterate on org-mode format with your feedback
4. ✅ Consider Phase 2 (external automation) if needed

## Questions?

If anything is unclear or you have additional requirements, please let us know!
