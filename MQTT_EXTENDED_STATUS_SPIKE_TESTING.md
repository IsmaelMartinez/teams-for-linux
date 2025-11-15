# MQTT Extended Status - Verification Spike Testing Guide

**Purpose**: Verify critical assumptions before implementing issue #1938

**Status**: TESTING ONLY - DO NOT USE IN PRODUCTION

---

## What We're Testing

1. **Spike 1**: getUserMedia interception works alongside injectedScreenSharing.js
2. **Spike 2**: Teams uses `track.enabled` (not mute events) for UI button clicks
3. **Spike 3**: Screen sharing detection logic correctly identifies screen vs call streams
4. **Spike 4**: Track state changes are detectable (enabled, readyState, muted, events)

---

## Setup Instructions

### 1. Enable Spike in Config

Add this to your `config.json`:

```json
{
  "mqttExtendedStatusSpike": true
}
```

**Location**:
- Linux: `~/.config/teams-for-linux/config.json`
- macOS: `~/Library/Application Support/teams-for-linux/config.json`
- Windows: `%APPDATA%\teams-for-linux\config.json`

### 2. Run Teams for Linux

```bash
npm start
```

**IMPORTANT**: Open the DevTools Console to see spike output:
- `Ctrl+Shift+I` (Linux/Windows)
- `Cmd+Option+I` (macOS)

Look for logs prefixed with `[MQTT_SPIKE]`

---

## Testing Procedure

### Test 1: Verify Interception Works

**Expected**: On startup, you should see:
```
[MQTT_SPIKE] ==========================================
[MQTT_SPIKE] MQTT Extended Status Verification Spike
[MQTT_SPIKE] This is for testing only
[MQTT_SPIKE] ==========================================
[MQTT_SPIKE] getUserMedia interceptor installed
```

**Result**: ✅ Pass / ❌ Fail

---

### Test 2: Join a Test Call

1. Join any Teams meeting or test call
2. Watch console for getUserMedia interception

**Expected output**:
```
[MQTT_SPIKE] ========================================
[MQTT_SPIKE] getUserMedia INTERCEPTED
[MQTT_SPIKE] Constraints: { audio: true, video: true, ... }
[MQTT_SPIKE] Is Screen Share: false
[MQTT_SPIKE] Stream created: { id: "...", audioTracks: 1, videoTracks: 1 }
[MQTT_SPIKE] ✅ REGULAR CALL STREAM - Monitoring
[MQTT_SPIKE] ----------------------------------------
[MQTT_SPIKE] Video Track 0: { enabled: true, muted: false, ... }
[MQTT_SPIKE] Audio Track 0: { enabled: true, muted: false, ... }
```

**Questions to answer**:
- ✅ Does getUserMedia get called when joining a call?
- ✅ Are both audio and video tracks present?
- ✅ Is `enabled: true` initially?

**Result**: ✅ Pass / ❌ Fail

---

### Test 3: Toggle Microphone (CRITICAL TEST)

**This is the most important test!**

1. In the call, click the **microphone button** to mute
2. Watch console closely

**Expected output (if Teams uses track.enabled)**:
```
[MQTT_SPIKE] 🎯 PROPERTY CHANGE: microphone-0.enabled changed: true → false
[MQTT_SPIKE] ⚠️  THIS CONFIRMS Teams uses track.enabled for UI buttons!
[MQTT_SPIKE] microphone-0 state: { enabled: false, muted: false, readyState: "live" }
```

**Alternative output (if Teams uses mute events)**:
```
[MQTT_SPIKE] 🔇 EVENT: microphone-0 MUTED
[MQTT_SPIKE] 🔇 PROPERTY CHANGE: microphone-0.muted changed: false → true
```

3. Click microphone button again to unmute
4. Observe what changes

**Questions to answer**:
- ✅ Does `track.enabled` change when you click the mic button?
- ✅ OR does `track.muted` change?
- ✅ OR do mute/unmute events fire?
- ✅ What's the timing? Immediate or delayed?

**Result**:
- Method used: _________________ (enabled / muted / events)
- ✅ Pass / ❌ Fail

---

### Test 4: Toggle Camera

1. In the call, click the **camera button** to turn off camera
2. Watch console

**Expected output**:
```
[MQTT_SPIKE] 🎯 PROPERTY CHANGE: camera-0.enabled changed: true → false
[MQTT_SPIKE] camera-0 state: { enabled: false, muted: false, readyState: "live" }
```

3. Turn camera back on
4. Observe changes

**Questions to answer**:
- ✅ Does camera use same method as microphone?
- ✅ Are state changes immediate?

**Result**: ✅ Pass / ❌ Fail

---

### Test 5: Test Keyboard Shortcuts

1. Use keyboard shortcuts instead of UI buttons:
   - **Ctrl+Shift+M** → Toggle microphone
   - **Ctrl+Shift+O** → Toggle camera

2. Watch if same state changes occur

**Questions to answer**:
- ✅ Do keyboard shortcuts trigger the same state changes as UI buttons?
- ✅ Are they detectable the same way?

**Result**: ✅ Pass / ❌ Fail

---

### Test 6: Screen Sharing Detection

1. While in a call, click "Share" to start screen sharing
2. Watch console for screen sharing stream detection

**Expected output**:
```
[MQTT_SPIKE] ========================================
[MQTT_SPIKE] getUserMedia INTERCEPTED
[MQTT_SPIKE] Constraints: { video: { chromeMediaSource: "desktop", ... } }
[MQTT_SPIKE] Is Screen Share: true
[MQTT_SPIKE] ⚠️  SCREEN SHARE STREAM - Skipping monitoring
```

**Questions to answer**:
- ✅ Is screen sharing stream correctly identified?
- ✅ Are we skipping monitoring it correctly?
- ✅ Does the call stream remain monitored?

**Result**: ✅ Pass / ❌ Fail

---

### Test 7: End Call

1. Leave the call
2. Watch console for track cleanup

**Expected output**:
```
[MQTT_SPIKE] 🔴 EVENT: camera-0 ENDED
[MQTT_SPIKE] 🔴 EVENT: microphone-0 ENDED
[MQTT_SPIKE] camera-0 ended, stopping poll
[MQTT_SPIKE] microphone-0 ended, stopping poll
```

**Questions to answer**:
- ✅ Do tracks properly end?
- ✅ Do polling intervals stop?
- ✅ No memory leaks?

**Result**: ✅ Pass / ❌ Fail

---

## Spike Results Summary

### Critical Findings

**1. getUserMedia Interception**:
- [ ] Works correctly
- [ ] Conflicts detected with injectedScreenSharing.js: _________________
- [ ] Other issues: _________________

**2. Teams Mute/Unmute Method** (MOST IMPORTANT):
- [ ] Uses `track.enabled = false/true` ← Our assumption
- [ ] Uses mute/unmute events ← Alternative approach needed
- [ ] Uses `track.muted` property
- [ ] Other method: _________________

**3. Screen Sharing Detection**:
- [ ] Correctly identifies screen sharing streams
- [ ] Correctly skips monitoring them
- [ ] Issues found: _________________

**4. Track State Changes**:
- [ ] Detectable via polling (500ms interval)
- [ ] Response time acceptable: ___ ms
- [ ] Events work better than polling
- [ ] Issues found: _________________

### Decision

Based on testing:
- [ ] ✅ Proceed with implementation as planned
- [ ] ⚠️  Modify approach: _________________
- [ ] ❌ Need different solution: _________________

---

## Next Steps

### If Spike Passes ✅

1. Remove spike code
2. Implement full `mqttExtendedStatus.js`
3. Add IPC communication
4. Add MQTT publishing
5. Add configuration
6. Test with actual MQTT broker

### If Spike Fails ❌

1. Document what failed
2. Investigate alternative approach
3. Update investigation document
4. Create new spike if needed

---

## Cleanup

After testing, **disable the spike**:

```json
{
  "mqttExtendedStatusSpike": false
}
```

Or remove the line entirely from config.json.

---

## Questions or Issues?

Document any unexpected behavior here:

```
[Your observations]
```
