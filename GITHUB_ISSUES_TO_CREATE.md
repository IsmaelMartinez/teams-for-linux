# GitHub Issues to Create - Integration & Experience 2025

**Project:** Integration & Experience 2025
**Created:** 2025-11-29

This document contains ready-to-create issue templates for the project. Copy each template directly into GitHub.

---

## Phase 1 Issues (Create Immediately)

### Issue 1: Calendar Data Export via MQTT Command

**Type:** Enhancement
**Related Issue:** #1995
**Milestone:** v2.7.0
**Labels:** `enhancement`, `mqtt`, `graph-api`, `ready-for-implementation`, `quick-win`
**Priority:** P0
**Effort:** 2-3 hours

---

**Title:** Implement Calendar Data Export via MQTT Command

**Description:**

### Summary

Add MQTT `get-calendar` command to expose Teams calendar data for external processing (org-mode conversion, custom dashboards, etc.) without requiring separate authentication scripts.

### User Need

User confirmed in #1995 they want calendar export for org-mode integration. Current workaround requires separate 2FA authentication that expires daily. Since users already log into Teams for Linux daily, the app can expose calendar data using existing authentication.

### Implementation

**Effort:** 2-3 hours (~20 lines of code)

Extend existing MQTT command handler in `app/index.js`:

```javascript
mqttClient.on('command', async (command) => {
  // ... existing commands (toggle-mute, toggle-video, etc.)

  if (command.action === 'get-calendar') {
    const { startDate, endDate } = command;
    if (!startDate || !endDate) {
      console.error('[MQTT] get-calendar requires startDate and endDate');
      return;
    }

    const result = await graphApiClient.getCalendarView(startDate, endDate);

    if (result.success) {
      mqttClient.publish('teams/calendar', JSON.stringify(result));
    } else {
      console.error('[MQTT] Failed to get calendar:', result.error);
    }
  }
});
```

### User Workflow Example

```bash
# 1. Send MQTT command for next 7 days
mosquitto_pub -h localhost -t teams/command -m '{
  "action": "get-calendar",
  "startDate": "2025-11-29T00:00:00Z",
  "endDate": "2025-12-06T23:59:59Z"
}'

# 2. Subscribe and process with external tool
mosquitto_sub -h localhost -t teams/calendar -C 1 | python3 ~/to_orgmode.py > calendar.org

# 3. Automate with cron (fetch daily at 6am)
0 6 * * * /home/user/scripts/fetch-teams-calendar.sh
```

### Architecture: Minimal Internal Logic

**What Teams for Linux does:**
- ✅ React to `get-calendar` MQTT command
- ✅ Fetch from Graph API
- ✅ Publish raw JSON to `teams/calendar` topic

**What Teams for Linux does NOT do:**
- ❌ Format conversion (user handles externally)
- ❌ Internal scheduling (user controls with cron)
- ❌ Data transformation (user's Python/shell scripts)

### Acceptance Criteria

- [ ] MQTT command `get-calendar` accepts `startDate` and `endDate` parameters
- [ ] Fetches calendar data using `graphApiClient.getCalendarView()`
- [ ] Publishes raw Graph API JSON to `teams/calendar` topic
- [ ] Documentation updated with complete workflow examples
- [ ] Example Python script for org-mode conversion provided
- [ ] Example cron integration script provided
- [ ] Example shell script for date range calculation
- [ ] User (#1995) successfully exports to org-mode
- [ ] Zero breaking changes to existing MQTT commands

### Dependencies

- ✅ Graph API client exists (`app/graphApi/index.js`)
- ✅ MQTT client exists (`app/mqtt/index.js`)
- ✅ MQTT commands infrastructure exists

### Testing

1. Enable Graph API: `graphApi.enabled: true`
2. Send `get-calendar` MQTT command with 7-day range
3. Verify calendar JSON published to `teams/calendar` topic
4. Test with Python org-mode converter
5. Test cron integration

### References

- **Research:** `docs-site/docs/development/research/calendar-data-export-research.md`
- **Related Issues:** #1995 (user request), #1832 (Graph API infrastructure)
- **Code:**
  - `app/graphApi/index.js` - GraphApiClient
  - `app/mqtt/index.js` - MQTT client
  - `app/index.js` - MQTT command handler

---

### Issue 2: MQTT Extended Status Phase 1a - Call and Screen Sharing

**Type:** Enhancement
**Related Issue:** #1938
**Milestone:** v2.7.0
**Labels:** `enhancement`, `mqtt`, `ready-for-implementation`, `phase-1a`
**Priority:** P0
**Effort:** 1-2 days

---

**Title:** MQTT Extended Status Phase 1a: Call and Screen Sharing State

**Description:**

### Summary

Publish call and screen sharing state to MQTT for home automation (RGB LEDs, status boards). **Simplified Phase 1a** using existing IPC events only. Phase 1b (camera/mic via WebRTC) comes later.

### User Need

User **vbartik** in #1938 requested extended status fields for RGB LED automation. They want to know when actually IN a call (not just "busy" presence status, which shows busy even for scheduled meetings not yet joined).

### Why Simplified Phase 1a?

**Existing IPC events already work:**
- `call-connected` / `call-disconnected` - `app/mainAppWindow/browserWindowManager.js:150-152`
- `screen-sharing-started` / `screen-sharing-stopped` - `app/screenSharing/service.js:22-24`

**Phase 1a solves 80% of user value with 20% of complexity:**
- User wants call state → we deliver call state + screen sharing as bonus
- Fast to implement (1-2 days vs 1-2 weeks for full WebRTC monitoring)
- Low risk (just wiring existing events)
- Sets foundation for Phase 1b (camera/mic) later

### Implementation

**Effort:** 1-2 days (~80 lines total)

**1. Add generic `publish()` to `app/mqtt/index.js`:**

```javascript
async publish(topic, payload, options = {}) {
  if (!this.isConnected || !this.client) {
    console.debug('[MQTT] Not connected, skipping publish');
    return;
  }

  const payloadString = typeof payload === 'object'
    ? JSON.stringify(payload)
    : String(payload);

  await this.client.publish(topic, payloadString, {
    retain: options.retain ?? true,
    qos: options.qos ?? 0
  });
}
```

**2. Create `app/mqtt/mediaStatusService.js`:**

```javascript
const { ipcMain } = require('electron');

class MQTTMediaStatusService {
  #mqttClient;
  #config;

  constructor(mqttClient, config) {
    this.#mqttClient = mqttClient;
    this.#config = config;
  }

  initialize() {
    // Wire existing IPC events to MQTT
    ipcMain.on('call-connected', () => this.#publishCallState(true));
    ipcMain.on('call-disconnected', () => this.#publishCallState(false));
    ipcMain.on('screen-sharing-started', () => this.#publishScreenSharing(true));
    ipcMain.on('screen-sharing-stopped', () => this.#publishScreenSharing(false));

    console.info('[MQTTMediaStatusService] Initialized');
  }

  async #publishCallState(inCall) {
    if (this.#config.mqtt?.call?.enabled) {
      await this.#mqttClient.publish(
        `${this.#config.mqtt.topicPrefix}/${this.#config.mqtt.call.topic}`,
        String(inCall),
        { retain: true }
      );
    }
  }

  async #publishScreenSharing(isSharing) {
    if (this.#config.mqtt?.screenSharing?.enabled) {
      await this.#mqttClient.publish(
        `${this.#config.mqtt.topicPrefix}/${this.#config.mqtt.screenSharing.topic}`,
        String(isSharing),
        { retain: true }
      );
    }
  }
}

module.exports = MQTTMediaStatusService;
```

**3. Configuration:**

```javascript
// app/config/index.js
mqtt: {
  default: {
    enabled: false,
    // ... existing options ...

    call: {
      enabled: true,
      topic: "in-call"
    },
    screenSharing: {
      enabled: true,
      topic: "screen-sharing"
    }
  }
}
```

### MQTT Topics

- `teams/in-call` → `"true"` / `"false"`
- `teams/screen-sharing` → `"true"` / `"false"`

### Home Assistant Integration Example

```yaml
automation:
  - alias: "RGB LED - Teams Call Active"
    trigger:
      platform: mqtt
      topic: "teams/in-call"
      payload: "true"
    action:
      service: light.turn_on
      target:
        entity_id: light.office_led
      data:
        rgb_color: [255, 0, 0]  # Red when in call

  - alias: "RGB LED - Teams Call Ended"
    trigger:
      platform: mqtt
      topic: "teams/in-call"
      payload: "false"
    action:
      service: light.turn_off
      target:
        entity_id: light.office_led
```

### Acceptance Criteria

- [ ] `teams/in-call` publishes `true` when call connects
- [ ] `teams/in-call` publishes `false` when call disconnects
- [ ] `teams/screen-sharing` publishes `true` when screen sharing starts
- [ ] `teams/screen-sharing` publishes `false` when screen sharing stops
- [ ] Configuration allows independent enable/disable of each topic
- [ ] MQTT messages published with < 1s latency
- [ ] Works with UI actions and keyboard shortcuts
- [ ] Documentation includes Home Assistant examples
- [ ] User (#1938) successfully integrates with RGB LEDs
- [ ] Zero performance regression during calls

### Iteration Plan

- **Phase 1a (This Issue):** Call + Screen Sharing (existing IPC) - 1-2 days
- **Phase 1b (Future Epic):** Camera + Microphone (WebRTC monitoring) - 1 week
- **Phase 2 (Future):** Additional status fields (message count, calendar notifications, etc.)

### Dependencies

- ✅ MQTT client exists (`app/mqtt/index.js`)
- ✅ IPC events exist (`call-connected`, `call-disconnected`, `screen-sharing-started/stopped`)
- ✅ Service pattern established (`app/notificationSystem/index.js`)

### Testing

1. Join Teams call → verify `teams/in-call: "true"`
2. Leave call → verify `teams/in-call: "false"`
3. Start screen sharing → verify `teams/screen-sharing: "true"`
4. Stop screen sharing → verify `teams/screen-sharing: "false"`
5. Test with MQTT subscriber: `mosquitto_sub -h localhost -t 'teams/#' -v`
6. Test with Home Assistant automation

### References

- **Research:** `docs-site/docs/development/research/mqtt-extended-status-investigation.md`
- **Related Issues:** #1938 (user request)
- **Code:**
  - `app/mqtt/index.js` - MQTT client
  - `app/mainAppWindow/browserWindowManager.js:150-152` - Call IPC events
  - `app/screenSharing/service.js:22-24` - Screen sharing IPC events

---

### Issue 3: Custom Tray Icons - Documentation and Bundled Variants

**Type:** Documentation + Enhancement
**Related Issue:** #2003
**Milestone:** v2.7.0
**Labels:** `documentation`, `enhancement`, `good-first-issue`
**Priority:** P1
**Effort:** 4-8 hours

---

**Title:** Document Custom Tray Icons and Bundle Community Variants

**Description:**

### Summary

Users frequently ask about custom tray icons (#2003 is latest example, but it's a recurring request). The app **already supports custom icons** via `appIcon` and `appIconType` config options, but this feature is not well documented. Create comprehensive guide and bundle popular community icon variants.

### User Need

Users want to:
- Customize tray icon to match their desktop theme
- Use different icon styles (flat, 3D, minimalist, etc.)
- Contribute custom icons to the community

### Current State

**Already works, just not documented:**
```json
{
  "appIcon": "/path/to/custom/icon.png",
  "appIconType": "default"
}
```

**Problem:** Most users don't know this exists!

### Implementation

**Effort:** 4-8 hours

**1. Create Documentation Page:** `docs-site/docs/customization/custom-icons.md`

**Content:**
- How to use `appIcon` and `appIconType` config options
- Icon file formats supported (PNG, SVG)
- Recommended sizes (16x16, 24x24, 32x32, 48x48, 256x256)
- Where to place custom icons
- Example configurations
- Troubleshooting (icon not appearing, wrong size, etc.)

**2. Create Icon Specification Guide:** `docs-site/docs/customization/icon-specification.md`

**Content:**
- Technical requirements (formats, sizes, transparency)
- Design guidelines (contrast, visibility at small sizes)
- Platform-specific considerations (Linux theming, macOS dark mode, Windows high-DPI)
- Export settings from common tools (Inkscape, GIMP, Adobe Illustrator)

**3. Bundle Community Icon Variants:**

Create `app/assets/icons/community/` directory with:
- **teams4linux-3dflat/** - Icon from #2003 (with author permission and credit)
- **teams4linux-cube/** - Icon from #2003 (with author permission and credit)
- **README.md** - Credits and usage instructions

**4. Add Icon Gallery to Docs Site:**

Create visual gallery showing:
- Default icon
- All bundled community icons
- Preview at different sizes
- Configuration snippet for each

**5. Update Main README:**

Add "Custom Icons" section:
- Quick mention of feature
- Link to full documentation
- Example screenshot

### Acceptance Criteria

- [ ] Documentation page: "Custom Tray Icons Guide" created
- [ ] Icon specification guide created
- [ ] At least 2 community icon variants bundled (from #2003 with permission)
- [ ] Icon gallery added to docs site
- [ ] README.md updated with custom icons section
- [ ] Configuration examples provided
- [ ] Credits properly documented for community contributors
- [ ] Screenshots of different icons in use
- [ ] Resolves recurring "how do I change the icon?" questions

### Files to Create/Modify

**New files:**
- `docs-site/docs/customization/custom-icons.md`
- `docs-site/docs/customization/icon-specification.md`
- `app/assets/icons/community/README.md`
- `app/assets/icons/community/teams4linux-3dflat/` (with icons)
- `app/assets/icons/community/teams4linux-cube/` (with icons)

**Modified files:**
- `README.md` - Add custom icons section
- `docs-site/docs/configuration.md` - Link to custom icons guide
- `docs-site/sidebars.js` - Add customization category

### Community Engagement

**Ask in #2003:**
- Request permission to use submitted icons
- Ask for different sizes if needed
- Credit author in README and documentation
- Invite other users to submit icons

**Future:** Consider creating community icon repository or gallery

### References

- **Related Issue:** #2003 (community icon contribution)
- **Existing Config:** `app/config/index.js` - `appIcon` and `appIconType` options
- **Current Icons:** `app/assets/icons/`

---

## Phase 2 Issues (Create This Week)

### Issue 4: Research Spike - Electron 38/39 Upgrade Compatibility

**Type:** Research Spike
**Milestone:** v2.8.0/v3.0.0
**Labels:** `research`, `infrastructure`, `spike`
**Priority:** P0
**Effort:** 2-4 hours

---

**Title:** Research: Electron 38/39 Upgrade Compatibility with electron-builder

**Description:**

### Goal

Test compatibility of Electron 38.x and 39.x with latest electron-builder **before** committing to a full upgrade. This research spike will determine if we can upgrade, and if so, to which version.

### Research Questions

1. **Does electron-builder 26.3.2 support Electron 38.2.x?**
2. **Does electron-builder 26.3.2 support Electron 39.2.4?**
3. **Are there breaking changes in Electron 38/39 that affect Teams for Linux?**
4. **If blocked: What are alternatives?** (electron-forge, custom build scripts, stay on 37)

### Test Approach

**1. Test Electron 38.2.x:**
```bash
# Create test branch
git checkout -b test/electron-38-compatibility

# Update package.json
"electron": "^38.2.1"
"electron-builder": "^26.3.2"

# Install
npm install

# Test basic build
npm run pack

# Test platform builds
npm run dist:linux:appimage
npm run dist:linux:deb
npm run dist:linux:rpm

# Test app functionality
npm start
# - Login to Teams
# - Join test call
# - Test screen sharing
# - Test notifications
# - Test IPC channels
```

**2. Test Electron 39.2.4:**
```bash
# Create test branch
git checkout -b test/electron-39-compatibility

# Update package.json
"electron": "^39.2.4"

# Repeat tests above
```

**3. Document Findings:**
Create compatibility matrix:

| Electron Version | electron-builder | Build Success | App Starts | Login Works | Screen Sharing | Notes |
|------------------|------------------|---------------|------------|-------------|----------------|-------|
| 37.9.0 (current) | 26.1.0 | ✅ | ✅ | ✅ | ✅ | Current stable |
| 38.2.1 | 26.3.2 | ? | ? | ? | ? | Test results |
| 39.2.4 | 26.3.2 | ? | ? | ? | ? | Test results |

### Deliverables

- [ ] Compatibility matrix document
- [ ] List of breaking changes (if any)
- [ ] List of blockers (if any)
- [ ] Recommendation: Electron 38, 39, or stay on 37
- [ ] If blocked: Alternative approaches documented
- [ ] Creates Epic issue based on findings

### Decision Tree

**If Both Compatible:**
- Recommend Electron 39 (latest features + security)
- Create Epic: "Upgrade to Electron 39"

**If Only 38 Compatible:**
- Recommend Electron 38 (stable + tested)
- Create Epic: "Upgrade to Electron 38"

**If electron-builder Blocked:**
- Research electron-forge compatibility
- Research custom build scripts
- Estimate migration effort
- Create Epic: "Evaluate electron-builder Alternatives"

**If Breaking Changes Found:**
- Document all breaking changes
- Estimate fix effort
- Decide: v3.0.0 (breaking) or stay on v37 for now

### Time Box

**Maximum 4 hours** - this is a research spike, not full implementation

### Success Criteria

- [ ] Both Electron 38 and 39 tested with electron-builder
- [ ] Compatibility matrix completed
- [ ] Clear recommendation documented
- [ ] Next steps identified (Epic created or decision to stay on v37)

### References

- **Current Version:** Electron 37.9.0, electron-builder 26.1.0
- **Target Versions:** Electron 38.2.1 or 39.2.4, electron-builder 26.3.2
- **Research Doc:** `docs-site/docs/development/research/electron-38-migration-analysis.md`

---

## Phase 3 Issues (Create After Phase 2 Complete)

These issues will be created after Phase 1 and Phase 2 research spikes complete.

### Issue 5: Tray Icon Logged-Off Indicator

**Type:** Enhancement
**Related Issue:** #1987
**Milestone:** v2.9.0/v3.1.0
**Labels:** `enhancement`, `ux`, `tray`
**Priority:** P1
**Effort:** 1-2 days

---

**Title:** Add Tray Icon Indicator for Logged-Off State

**Description:**

### Summary

Change tray icon to visually indicate when user is not logged into Teams. Improves user awareness of connection state.

### User Need

From #1987: Users want to know at a glance if they're logged into Teams or not, without having to open the app.

### Proposed States

1. **Logged in + connected:** Normal icon
2. **Not logged in:** Grayscale/dimmed icon or different icon variant
3. **Logged in but disconnected:** Warning icon or badge overlay (optional)

### Implementation Approach

**1. Detect Login State:**
```javascript
// Monitor authentication state changes
// Options:
// - DOM observer for login screen
// - Graph API token availability
// - Presence of authentication cookies
```

**2. Icon State Management:**
```javascript
class TrayIconManager {
  updateIcon(state) {
    switch(state) {
      case 'logged-in':
        tray.setImage(normalIcon);
        break;
      case 'logged-out':
        tray.setImage(grayscaleIcon);
        break;
      case 'disconnected':
        tray.setImage(warningIcon);
        break;
    }
  }
}
```

**3. Configuration:**
```json
{
  "tray": {
    "showLoggedOffIndicator": true  // default: true
  }
}
```

### Acceptance Criteria

- [ ] Detects login/logout state accurately
- [ ] Icon changes based on state
- [ ] Configuration option to enable/disable feature
- [ ] Icon variants for each state created
- [ ] Works with default and custom icons
- [ ] Works across all platforms (Linux, macOS, Windows)
- [ ] Tray tooltip updated with state ("Teams - Logged In", "Teams - Logged Out")
- [ ] Documentation updated
- [ ] User (#1987) confirms feature meets need

### Design Considerations

**Icon Variants Needed:**
- Normal (existing)
- Grayscale/dimmed (new)
- Warning/disconnected (new, optional)

**Platform Testing:**
- Linux: Various desktop environments (GNOME, KDE, XFCE, etc.)
- macOS: Light and dark modes
- Windows: Different theme colors

### Files to Create/Modify

**New files:**
- `app/assets/icons/logged-out/` - Grayscale icon variants
- `app/assets/icons/disconnected/` - Warning icon variants (optional)

**Modified files:**
- `app/trayIconRenderer/index.js` - State management
- `app/config/index.js` - Configuration option
- `docs-site/docs/configuration.md` - Documentation

### Dependencies

- Login state detection (needs research - DOM observer or Graph API check?)
- Icon variants created

### References

- **Related Issue:** #1987
- **Code:** `app/trayIconRenderer/`

---

### Issue 6: Research Spike - Multiple Windows Feasibility

**Type:** Research Spike
**Related Issue:** #1984
**Milestone:** v2.9.0/v3.1.0
**Labels:** `research`, `ux`, `spike`, `multiple-windows`
**Priority:** P2
**Effort:** 4-6 hours

---

**Title:** Research: Multiple Windows Feasibility (Chat + Meeting)

**Description:**

### Goal

Investigate if we can open separate BrowserWindows for chat and meeting simultaneously. This is a **feasibility research spike** - we need to know if it's technically possible before committing to implementation.

### User Need

From #1984: Users want to chat with other people while in a meeting. Current workaround requires switching between meeting and chat views, which disrupts the meeting.

### Research Questions

**Technical Feasibility:**
1. Can Teams web app run in multiple BrowserWindows concurrently?
2. How to share authentication state across windows?
3. Do DOM/React states conflict between windows?
4. Memory/performance impact of multiple windows?

**User Experience:**
5. How would users manage multiple windows?
6. What's the interaction model? (open chat window during meeting, PiP, etc.)
7. Which window has focus when notification arrives?

**Alternative Approaches:**
8. Picture-in-picture for meeting, main window for chat?
9. Split-screen layout in single window?
10. Electron's `BrowserView` for embedded chat panel?

### Test Approach

**POC 1: Dual BrowserWindows**
```javascript
// Create two windows loading same Teams URL
const mainWindow = new BrowserWindow({ ... });
const chatWindow = new BrowserWindow({ ... });

mainWindow.loadURL('https://teams.microsoft.com/v2');
chatWindow.loadURL('https://teams.microsoft.com/v2');

// Test:
// - Do both authenticate correctly?
// - Can you chat in one, join meeting in other?
// - What happens to shared state (presence, notifications)?
```

**POC 2: Session Sharing**
```javascript
// Use same partition to share authentication
const mainWindow = new BrowserWindow({
  webPreferences: { partition: 'persist:teams' }
});
const chatWindow = new BrowserWindow({
  webPreferences: { partition: 'persist:teams' }
});
```

**POC 3: BrowserView Embedded Panel**
```javascript
// Embed chat as BrowserView in meeting window
const mainWindow = new BrowserWindow({ ... });
const chatView = new BrowserView({ ... });
mainWindow.setBrowserView(chatView);
```

### Measurements

**Memory Usage:**
- Single window: X MB
- Dual windows: Y MB
- Overhead: (Y - X) MB
- Acceptable if < 500MB overhead

**Performance:**
- CPU usage during meeting with dual windows
- Frame rate impact
- Audio/video quality impact

### Deliverables

- [ ] Feasibility assessment document
- [ ] POC code (if feasible)
- [ ] Memory/performance metrics
- [ ] User workflow mockups
- [ ] Recommendation: Implement, defer, or close as infeasible

### Decision Tree

**If Technically Feasible + Good UX:**
- Create Epic: "Multiple Windows Implementation"
- Estimate: 1-2 weeks

**If Feasible But Complex:**
- Document approach
- Estimate effort
- Defer to later release (v3.x)
- Keep #1984 open with "deferred" label

**If Not Feasible:**
- Document reasons (technical limitations)
- Suggest alternatives (split layout, PiP, etc.)
- Close #1984 with explanation
- Create new issue for alternative approach if promising

### Time Box

**Maximum 6 hours** - this is a research spike

### Success Criteria

- [ ] All research questions answered
- [ ] POCs tested (at least 2 approaches)
- [ ] Memory/performance measured
- [ ] Clear recommendation documented
- [ ] Next steps identified

### References

- **Related Issue:** #1984
- **Electron Docs:** BrowserWindow, BrowserView, Session
- **Teams URL:** https://teams.microsoft.com/v2

---

### Issue 7: Research Spike - Audio Device Selection API

**Type:** Research Spike
**Related Issue:** #1965
**Milestone:** v2.9.0/v3.1.0
**Labels:** `research`, `audio`, `spike`
**Priority:** P2
**Effort:** 2-3 hours

---

**Title:** Research: Audio Device Selection API Capabilities

**Description:**

### Goal

Investigate Electron's capabilities for audio device selection and routing. Determine if we can implement full multi-soundcard support or need to document platform-specific workarounds.

### User Need

From #1965: Users want to select which audio input/output devices Teams uses for calls, separate from system default.

### Research Questions

**API Capabilities:**
1. Can Electron set default audio input/output devices per app?
2. What does `navigator.mediaDevices.enumerateDevices()` provide?
3. Can we constrain `getUserMedia()` to specific deviceId?
4. Can we persist device preferences?
5. Can we handle device connect/disconnect events?

**Platform Limitations:**
6. Linux: PulseAudio vs PipeWire vs ALSA differences?
7. macOS: System audio routing capabilities?
8. Windows: WASAPI device selection?

### Test Approach

**Test 1: Enumerate Devices**
```javascript
navigator.mediaDevices.enumerateDevices()
  .then(devices => {
    devices.forEach(device => {
      console.log(device.kind, device.label, device.deviceId);
    });
  });
```

**Test 2: Constrain getUserMedia**
```javascript
navigator.mediaDevices.getUserMedia({
  audio: { deviceId: { exact: 'specific-device-id' } },
  video: false
}).then(stream => {
  // Did we get the right device?
});
```

**Test 3: Device Change Events**
```javascript
navigator.mediaDevices.addEventListener('devicechange', () => {
  // Re-enumerate devices
  // Update UI if current device disconnected
});
```

**Test 4: Platform-Specific**
- Linux: Test with USB headset connect/disconnect
- macOS: Test with AirPods connect/disconnect
- Windows: Test with multiple audio devices

### Deliverables

- [ ] API capabilities document
- [ ] Platform-specific limitations documented
- [ ] Implementation approach recommendation
- [ ] If limited API: Document workarounds

### Decision Tree

**If Full API Support:**
- Create Issue: "Implement Audio Device Selection UI"
- Effort: 3-5 days

**If Limited API Support:**
- Create Issue: "Basic Audio Device Selection + Platform Workarounds"
- Effort: 2-3 days implementation + documentation
- Document platform-specific settings (PulseAudio, macOS Sound prefs, etc.)

**If No API Support:**
- Document platform-specific workarounds only
- Close #1965 with explanation and workaround guide
- Link to platform documentation

### Time Box

**Maximum 3 hours**

### Success Criteria

- [ ] All research questions answered
- [ ] API capabilities documented
- [ ] Platform limitations identified
- [ ] Clear recommendation provided
- [ ] Next steps identified

### References

- **Related Issue:** #1965
- **Web API:** [MediaDevices.enumerateDevices()](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/enumerateDevices)
- **Electron:** Chromium Web APIs available in Electron

---

## Epic Issues (Create After Research Spikes)

These Epic issues will be created **after** the research spikes complete, based on their findings.

### Epic: Electron 38/39 Upgrade

*Created after Issue #4 (Research Spike) completes*

**Title:** Epic: Upgrade to Electron 38/39

**Type:** Epic
**Milestone:** v2.8.0 or v3.0.0
**Labels:** `epic`, `infrastructure`, `breaking-change-candidate`
**Effort:** 4-6 days
**Priority:** P1

**Subtasks:**
- [ ] Update package.json dependencies
- [ ] Test authentication flow
- [ ] Test screen sharing (Linux X11)
- [ ] Test screen sharing (Linux Wayland)
- [ ] Test screen sharing (macOS)
- [ ] Test screen sharing (Windows)
- [ ] Test all IPC channels
- [ ] Test notifications
- [ ] Test window management
- [ ] Test global shortcuts
- [ ] Test MQTT integration
- [ ] Test Graph API
- [ ] Cross-platform builds (AppImage, deb, rpm, snap, dmg, exe)
- [ ] Performance benchmarking
- [ ] Update documentation
- [ ] Create release notes

---

### Epic: Multiple Windows Implementation

*Created after Issue #6 (Research Spike) if feasible*

**Title:** Epic: Multiple Windows Support (Chat + Meeting)

**Type:** Epic
**Milestone:** v3.0.0 or later
**Labels:** `epic`, `enhancement`, `ux`, `multiple-windows`
**Effort:** 1-2 weeks
**Priority:** P2

**Subtasks:**
- [ ] Create secondary BrowserWindow class
- [ ] Implement authentication state sharing
- [ ] Window management (open, close, focus)
- [ ] Memory optimization
- [ ] IPC channels for window communication
- [ ] Tray menu integration
- [ ] Configuration options
- [ ] Cross-platform testing
- [ ] Documentation
- [ ] User workflow guide

---

### Issue: Multi Soundcard Implementation

*Created after Issue #7 (Research Spike) if API supports*

**Title:** Implement Audio Device Selection UI

**Type:** Enhancement
**Related Issue:** #1965
**Milestone:** v2.9.0/v3.1.0
**Labels:** `enhancement`, `audio`
**Effort:** 3-5 days
**Priority:** P2

**Tasks:**
- [ ] Settings menu: Audio device selection
- [ ] List available input devices
- [ ] List available output devices
- [ ] Persist device preferences
- [ ] Apply devices when joining call
- [ ] Handle device connect/disconnect
- [ ] Platform-specific testing
- [ ] Documentation

---

### Issue: MQTT Extended Status Phase 1b (Future)

**Title:** MQTT Extended Status Phase 1b: Camera and Microphone State

**Type:** Enhancement
**Related Issue:** #1938
**Milestone:** Future (after Phase 1a success)
**Labels:** `enhancement`, `mqtt`, `webrtc`, `phase-1b`
**Effort:** 1 week
**Priority:** P3 (deferred)

**Description:**

Extend MQTT Extended Status with camera and microphone state using WebRTC monitoring. This is Phase 1b - only implement after Phase 1a (call/screen sharing) is successful and user feedback is positive.

**Implementation:**
- Intercept `getUserMedia()` calls
- Monitor MediaStreamTrack states
- Hybrid approach: Events + polling for `track.enabled`
- Screen sharing stream detection

**Topics:**
- `teams/camera` → `"true"` / `"false"`
- `teams/microphone` → `"true"` / `"false"`

---

## Summary

### Create Immediately (Phase 1)

1. ✅ Calendar Data Export (#1995 enhancement)
2. ✅ MQTT Extended Status Phase 1a (#1938 enhancement)
3. ✅ Custom Icons Documentation (#2003 enhancement)

**Total: 3 issues**

### Create This Week (Phase 2)

4. ✅ Electron Research Spike (new)

**Total: 1 issue**

### Create After Research (Phase 2+3)

5. ⏳ Electron 38/39 Upgrade Epic (if research passes)
6. ⏳ Tray Logged-Off Indicator (#1987 enhancement)
7. ⏳ Multiple Windows Research Spike (new)
8. ⏳ Multiple Windows Epic (if feasible)
9. ⏳ Audio Device Research Spike (new)
10. ⏳ Multi Soundcard Implementation (#1965 enhancement, if API supports)

**Total: 6 issues (conditional)**

### Future Considerations

11. ⏸️ MQTT Extended Status Phase 1b (deferred until Phase 1a feedback)

---

**Document Status:** Ready for issue creation
**Next Action:** Copy templates into GitHub and create issues
