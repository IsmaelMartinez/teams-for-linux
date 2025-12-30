---
id: ai-example-research
title: "Example: Research Document"
sidebar_label: Research Example
---

# Example: Research Document

What a research document looks like in practice. This is a real example, lightly edited.

---

## The Task

"Add MQTT support for publishing Teams status to home automation systems."

---

## The Research Document

```markdown
# Research: MQTT Status Publishing

**Date:** 2024-11-15
**Status:** Research complete, ready for implementation
**Time spent:** ~2 hours

## Problem Statement

Users want to publish their Teams status (available, busy, in a meeting) to
MQTT brokers for home automation integration. This would allow:
- Turning on a "do not disturb" light when in a meeting
- Adjusting home automation based on work status
- Integrating with Home Assistant, OpenHAB, etc.

## Existing Patterns

Checked existing codebase for similar features:
- `app/notifications/` - Uses event-based pattern for status changes
- `app/config/` - Configuration follows the AppConfiguration pattern
- `app/browser/tools/presence.js` - Already tracks presence status

Key pattern: Status changes are detected in renderer, sent via IPC to main process.

## Approaches Considered

### Option A: Direct MQTT client in main process
- Add mqtt.js as dependency
- Main process connects to broker, publishes on status change
- Pros: Simple, single connection
- Cons: Another dependency, connection management complexity

### Option B: Webhook/HTTP approach
- Publish status to configurable HTTP endpoint
- User runs their own bridge to MQTT
- Pros: Simpler code, no MQTT dependency
- Cons: Extra hop, users need to set up bridge

### Option C: Configurable with MQTT built-in
- MQTT client as optional feature
- Falls back gracefully if not configured
- Pros: Best user experience, opt-in complexity
- Cons: Dependency added to project

**Recommendation:** Option C. The mqtt.js package is small (~50KB), the user
demand is clear from issues, and it matches the pattern of other optional
integrations (notifications, tray icon).

## Security Considerations

- MQTT credentials must not be logged
- Connection failures should not crash the app
- User should be able to configure TLS
- Password should be stored securely (use existing config pattern)

## Open Questions

1. Should we support MQTT v5 or stick with v3.1.1?
   → Answer: v3.1.1 is more widely supported, start there

2. What topic structure?
   → Answer: Configurable, with sensible default like `teams-for-linux/status`

3. What payload format?
   → Answer: JSON with status, timestamp, configurable

## Implementation Plan

1. Add mqtt.js dependency
2. Create `app/mqtt/` module following existing patterns
3. Add configuration options to AppConfiguration
4. Connect IPC from presence detection to MQTT publisher
5. Add error handling and graceful degradation
6. Add documentation

Estimated effort: 4-6 hours

## References

- Issue #1847 requesting this feature
- mqtt.js documentation: https://github.com/mqttjs/MQTT.js
- Similar implementation in Home Assistant: [link]
```

---

## What Makes This Good

1. **States the problem clearly.** What does the user want? Why?

2. **Checks existing patterns.** What's already in the codebase that we should follow?

3. **Considers multiple approaches.** Not just one solution, but alternatives with tradeoffs.

4. **Makes a recommendation.** Doesn't just list options; picks one with reasoning.

5. **Addresses security upfront.** Before writing code, not after review feedback.

6. **Notes open questions with answers.** Shows the thinking process.

7. **Provides implementation plan.** Clear next steps, rough estimate.

---

## Time Investment

This document took about 2 hours to create:
- 30 min: Reading existing code patterns
- 30 min: Researching MQTT options
- 30 min: Evaluating approaches
- 30 min: Writing up findings

The implementation took 4 hours. The research prevented:
- Wrong approach (webhook was considered)
- Security issues (credentials logging was a real risk)
- Pattern violations (not following AppConfiguration)

**Net time saved:** Probably 2-3 hours of rework avoided.

---

## When to Do This

Research docs at this level for:
- New features with multiple valid approaches
- Integrations with external systems
- Changes that affect architecture
- Anything security-relevant

Skip detailed research for:
- Bug fixes with clear cause
- Small features in well-established patterns
- Changes under 1 hour of work

---

**See also:** [Spike Example](spike-example.md) | [Gate Conversation](gate-conversation.md)
