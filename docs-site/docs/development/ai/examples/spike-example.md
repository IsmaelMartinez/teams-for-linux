---
id: ai-example-spike
title: "Example: Spike Validation"
sidebar_label: Spike Example
---

# Example: Spike Validation

What a spike looks like in practice. This is based on real validation work.

---

## The Assumption

"We're assuming Electron's `desktopCapturer` API can capture the Teams call window for screen sharing indicators."

We needed to detect when a user was screen sharing in a Teams call to update the tray icon. The assumption was that `desktopCapturer` would give us what we needed.

---

## The Spike

**Time-box:** 45 minutes

**Success criteria:**
- Can enumerate windows/screens
- Can identify the Teams window
- Can detect screen sharing state

**Failure criteria:**
- API doesn't expose what we need
- Performance is unacceptable
- Security restrictions block it

---

## The Code

```javascript
// spike-desktop-capturer.js
// Purpose: Validate desktopCapturer can detect Teams sharing state
// NOT production code - just proving/disproving assumption

const { desktopCapturer } = require('electron');

async function testCapture() {
  try {
    // Get all sources (screens and windows)
    const sources = await desktopCapturer.getSources({
      types: ['window', 'screen'],
      thumbnailSize: { width: 150, height: 150 }
    });

    console.log(`Found ${sources.length} sources`);

    // Look for Teams window
    const teamsSource = sources.find(s =>
      s.name.includes('Teams') || s.name.includes('Microsoft Teams')
    );

    if (teamsSource) {
      console.log('Found Teams window:', teamsSource.name);
      console.log('ID:', teamsSource.id);
      // Note: thumbnail is available but doesn't tell us sharing state
    } else {
      console.log('Teams window not found in sources');
    }

    // Key finding: desktopCapturer gives us window list,
    // but NOT whether the window is currently being shared
    // We'd need to track this ourselves when sharing starts

  } catch (err) {
    console.error('Capture failed:', err);
  }
}

testCapture();
```

---

## The Findings

**After 45 minutes:**

| Criterion | Result |
|-----------|--------|
| Enumerate windows/screens | ✅ Works |
| Identify Teams window | ✅ Works (by name matching) |
| Detect screen sharing state | ❌ Not available from this API |

**The key learning:** `desktopCapturer` tells you what *can* be shared, not what *is being* shared. For screen sharing state, we need to:
1. Track when sharing is initiated (user action)
2. Listen for Teams-internal events (if exposed)
3. Use a different approach entirely

---

## The Decision

The spike revealed our assumption was wrong. We pivoted to:
- Listening for Teams DOM events indicating sharing state
- Injecting a content script that detects the sharing UI elements
- This approach was validated in a follow-up spike (30 min)

**Time spent:** 45 min on failed approach + 30 min on successful approach = 75 min total

**Time saved:** If we'd built the full feature on the wrong assumption, we'd have wasted 4-6 hours before discovering it didn't work.

---

## What Makes This Good

1. **Clear assumption stated.** Not vague exploration; specific thing to validate.

2. **Time-boxed.** 45 minutes, not open-ended. Prevents rabbit holes.

3. **Success/failure criteria defined.** Know when you're done.

4. **Minimal code.** Just enough to prove/disprove. Not production quality.

5. **Documented findings.** What worked, what didn't, what we learned.

6. **Decision made.** Spike led to clear next step.

---

## When to Spike

**Spike when:**
- Third-party API behavior is unclear
- Performance is uncertain at scale
- You're not sure the approach is possible
- Being wrong would cost days of work

**Don't spike when:**
- API is well-documented and trusted
- You've done this before
- The cost of being wrong is low
- Time pressure outweighs validation value

---

## Spike vs. Prototype

| Spike | Prototype |
|-------|-----------|
| Validates assumption | Explores solution |
| 30 min - 2 hours | Hours to days |
| Throw away code | May evolve to production |
| Answer: yes/no | Answer: here's how |

Spikes answer: "Can we do this?"
Prototypes answer: "How should we do this?"

---

**See also:** [Research Example](research-doc-example.md) | [Gate Conversation](gate-conversation.md)
