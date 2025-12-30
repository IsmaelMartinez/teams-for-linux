---
id: ai-example-gate
title: "Example: Gate Conversation"
sidebar_label: Gate Example
---

# Example: Gate Conversation

What a gate (human checkpoint) looks like in practice. This is a reconstructed example showing the pattern.

---

## The Context

Implementing MQTT status publishing. After completing the initial module structure, hitting the first gate.

---

## The Conversation

**AI:** I've completed the initial MQTT module structure:
- Created `app/mqtt/index.js` with MQTTClient class
- Added configuration options to AppConfiguration
- Set up basic connect/disconnect/publish methods

Ready to proceed with IPC integration?

---

**Human:** Hold on. Show me the configuration options you added.

---

**AI:** Here's what I added to the configuration:

```javascript
// In app/appConfiguration/index.js
mqttEnabled: {
  type: 'boolean',
  default: false,
  description: 'Enable MQTT status publishing'
},
mqttBrokerUrl: {
  type: 'string',
  default: 'mqtt://localhost:1883',
  description: 'MQTT broker URL'
},
mqttUsername: {
  type: 'string',
  default: '',
  description: 'MQTT username'
},
mqttPassword: {
  type: 'string',
  default: '',
  description: 'MQTT password'
},
mqttTopic: {
  type: 'string',
  default: 'teams-for-linux/status',
  description: 'MQTT topic for status updates'
}
```

---

**Human:** Two concerns:

1. The password is stored in plain text config. We should at least warn users this isn't secure, or better, use the system keychain.

2. What happens if the broker URL is malformed? We need validation.

---

**AI:** Good catches. Here's my plan:

1. For password security:
   - Add a comment in the config noting it's stored in plain text
   - Add a warning log on first connect if password is set
   - Create an issue to investigate system keychain integration (future work)

2. For URL validation:
   - Add validation in the setter
   - Graceful failure if URL is invalid (log error, disable MQTT)
   - Don't crash the app

Should I implement these before proceeding with IPC integration?

---

**Human:** Yes. Implement both. Also add the IPC channel to the security allowlist while you're at it.

---

**AI:** Understood. I'll:
1. Add password security warning
2. Add URL validation with graceful failure
3. Add IPC channel to `app/security/ipcValidator.js` allowlist

I'll show you the changes before moving on.

---

## What Happened Here

1. **AI completed a task and asked for approval** (the gate)
2. **Human reviewed and found issues** (security, validation)
3. **AI proposed fixes** (not defensive, incorporated feedback)
4. **Human approved direction** (gate passed with modifications)
5. **Work continues** to next gate

---

## What Makes This Good

**AI behavior:**
- Stopped at a logical checkpoint (not mid-feature)
- Showed specific code for review
- Didn't argue when issues were raised
- Proposed concrete solutions

**Human behavior:**
- Actually reviewed the code (not just "looks good")
- Raised specific concerns (security, validation)
- Gave clear direction on how to proceed
- Didn't nitpick style when architecture was the question

---

## Common Gate Anti-Patterns

### Auto-Approving
```
AI: Ready for next?
Human: y
AI: Ready for next?
Human: y
AI: Ready for next?
Human: y
```
If you're always saying yes, the gate is theater. Either extend autonomy or actually review.

### Over-Gating
```
AI: I wrote line 1. Ready for line 2?
```
Too granular. Gates should be at logical checkpoints, not every line.

### Ignoring Gates
```
AI: I completed the entire feature including deployment.
    Here's the 500-line diff.
```
Too much autonomy. The gate window was missed.

---

## When to Insert Gates

**Gate after:**
- Completing a logical sub-component
- Making an architectural decision
- Adding configuration or security-relevant code
- Every 3-5 "steps" of AI autonomy
- Before touching production systems

**Don't gate:**
- Every line of code
- Mechanical changes (formatting, renames)
- Work that's easily reversible

---

## Gate Frequency by Risk

| Code Type | Gate Frequency |
|-----------|---------------|
| Internal tools | Every major component |
| Non-sensitive features | Every sub-feature |
| User-facing changes | More frequent |
| Security-relevant | Very frequent |
| Auth/payments | Nearly every change |

---

**See also:** [Research Example](research-doc-example.md) | [Spike Example](spike-example.md)
