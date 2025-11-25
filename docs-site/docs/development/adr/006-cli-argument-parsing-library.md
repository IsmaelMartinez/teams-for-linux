---
id: 006-cli-argument-parsing-library
---

# ADR 006: CLI Argument Parsing Library Decision

## Status

Accepted

## Context

Teams for Linux uses `yargs` for CLI argument parsing. We evaluated whether to:
1. Add CLI-based action commands (`teams-for-linux action toggle-mute`)
2. Migrate to `commander.js` for better subcommand support
3. Keep current `yargs` implementation

### Requirements
- Support 30+ configuration options
- Parse config files and environment variables
- Handle meeting URLs as positional arguments (`teams-for-linux https://teams.microsoft.com/...`)
- Low risk of breaking existing functionality

### Considered Options

**Option A: Add CLI Action Commands with yargs**
- Requires fragile pre-parsing before yargs initialization
- High risk of breaking meeting link flow (critical feature)
- Conflicts with existing URL positional argument handling
- Effort: 14-23 hours

**Option B: Migrate to commander.js**
- Better subcommand support
- Requires reimplementing config file and environment variable parsing
- 30+ options need migration
- Effort: 6-8 hours
- Risk: Medium (regression testing needed)

**Option C: Keep yargs, Use Alternative Command Mechanism**
- MQTT for actions (see MQTT Commands Research)
- HTTP server for actions
- No CLI parsing changes needed
- Effort: 4-6 hours
- Risk: Low (isolated addition)

---

## Decision

**Stick with yargs. Do not add CLI action commands. Use MQTT for action triggers.**

### Rationale

1. **yargs is appropriate for current use case**
   - Config-heavy application (30+ options)
   - Built-in config file and environment variable support
   - No need for subcommands (actions handled via MQTT)

2. **Avoid fragile bypass layer**
   - Pre-parsing arguments before yargs creates tight coupling
   - High risk of breaking meeting link handling
   - Difficult to maintain

3. **Better alternatives exist**
   - MQTT commands: Clean architecture, extensible, low risk
   - HTTP server: Zero external dependencies for shortcuts
   - No need for complex CLI parsing

4. **Future-proofing**
   - Can migrate to commander.js during major version bump (v2.0+) if multiple subcommands become necessary
   - Current architecture works well for current needs

---

## Consequences

### Positive
- ✅ No risk to existing functionality (meeting links, config options)
- ✅ No migration effort
- ✅ Built-in config/env parsing continues working
- ✅ Users get action commands via MQTT (better UX anyway)

### Negative
- ⚠️ No native CLI subcommands (not needed currently)
- ⚠️ Future subcommand needs require migration or workarounds

### Neutral
- Option to migrate to commander.js remains open for future major versions
- Decision can be revisited if requirements change significantly

---

## References

- [CLI Arguments vs MQTT Comparison](../research/mqtt-commands-implementation.md)
- [yargs Documentation](https://yargs.js.org/)
- [commander.js Documentation](https://github.com/tj/commander.js)
