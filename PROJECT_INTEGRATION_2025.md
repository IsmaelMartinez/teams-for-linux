# Project: Integration & Experience 2025

**Version:** 1.0
**Created:** 2025-11-29
**Status:** Planning Phase
**Target Release:** v2.7.0 → v3.0.0

---

## Project Vision

**"Making Teams for Linux more integrated, aware, and flexible"**

Improve external system integration (MQTT, calendar), modernize the platform (Electron upgrade), enhance user experience (tray indicators, multi-window, audio routing), and make customization easier (custom icons).

---

## Project Scope

### Confirmed Issues

| Issue | Feature | Type | Effort | Priority |
|-------|---------|------|--------|----------|
| [#1995](https://github.com/IsmaelMartinez/teams-for-linux/issues/1995) | Calendar Data Export via MQTT | Enhancement | 2-3 hours | P0 (Quick win) |
| [#1938](https://github.com/IsmaelMartinez/teams-for-linux/issues/1938) | Extended MQTT Status (Call/Screen) | Enhancement | 1-2 days | P0 (High demand) |
| [#2003](https://github.com/IsmaelMartinez/teams-for-linux/issues/2003) | Custom Tray Icons Support | Documentation | 4-8 hours | P1 (Recurring ask) |
| [#1987](https://github.com/IsmaelMartinez/teams-for-linux/issues/1987) | Tray Icon Logged-Off Indicator | Enhancement | 1-2 days | P1 (UX improvement) |
| [#1984](https://github.com/IsmaelMartinez/teams-for-linux/issues/1984) | Multiple Windows (Chat + Meeting) | Epic | 1-2 weeks | P2 (Complex) |
| [#1965](https://github.com/IsmaelMartinez/teams-for-linux/issues/1965) | Multi Soundcard Support | Enhancement | 3-5 days | P2 (Platform-specific) |

### Research Spikes (No Issues Yet)

| Spike | Purpose | Effort | Creates Issue? |
|-------|---------|--------|----------------|
| Electron 38/39 Compatibility | Verify electron-builder compatibility | 2-4 hours | Yes (Epic) |
| Custom Icons Implementation | Research best approach (docs vs bundled icons) | 2-3 hours | No (part of #2003) |
| Multiple Windows Feasibility | Can we open separate windows for chat? | 4-6 hours | Yes (Technical Decision) |
| Audio Device Selection API | Electron audio routing capabilities | 2-3 hours | No (part of #1965) |

---

## Project Themes

### Theme 1: External Integration 🔗
**Goal:** Better integration with external systems

**Features:**
- Calendar Data Export (#1995) - Access calendar data for org-mode, dashboards
- Extended MQTT Status (#1938) - Call/screen state for home automation

**User Value:** Automate workflows, integrate with productivity tools

---

### Theme 2: Platform Modernization 🚀
**Goal:** Modern, secure, performant platform

**Features:**
- Electron 38/39 Upgrade (Research spike → Epic)
- electron-builder compatibility verification

**User Value:** Latest features, security patches, better performance

---

### Theme 3: User Experience 👤
**Goal:** Better awareness and flexibility

**Features:**
- Tray Icon Logged-Off Indicator (#1987) - Visual feedback for login state
- Custom Tray Icons Support (#2003) - Personalization and theming
- Multiple Windows (#1984) - Chat while in meeting
- Multi Soundcard Support (#1965) - Better audio device control

**User Value:** Better multitasking, customization, hardware support

---

## Implementation Phases

### Phase 1: Quick Wins & Foundation (Week 1-2)

**Milestone:** v2.7.0 - "External Integration & Quick Wins"

**Goal:** Ship high-value, low-complexity features fast

**Features:**
1. **Calendar Data Export** (#1995) - 2-3 hours
   - Add MQTT `get-calendar` command
   - Publish raw Graph API JSON
   - Document user workflow
   - **Blocker:** None (Graph API exists)
   - **Risk:** Low

2. **MQTT Extended Status Phase 1a** (#1938) - 1-2 days
   - Wire existing IPC events (call-connected, screen-sharing)
   - Publish to MQTT topics
   - Configuration options
   - **Blocker:** None (IPC events exist)
   - **Risk:** Low

3. **Custom Icons Documentation** (#2003) - 4-8 hours
   - Document how to use custom icons (already supported!)
   - Create icon specification guide
   - Bundle 2-3 community icon variants
   - Add to docs site
   - **Blocker:** None
   - **Risk:** Low

**Deliverables:**
- v2.7.0 release
- Users can integrate Teams with external systems
- Users can customize tray icons
- Documentation updated

**Total Effort:** ~4-5 days

---

### Phase 2: Platform Modernization (Week 3-4)

**Milestone:** v2.8.0 or v3.0.0 - "Modern Platform"

**Goal:** Upgrade to latest Electron while maintaining stability

**Research Spikes:**
1. **Electron Compatibility Research** (2-4 hours)
   - Test Electron 38.x with electron-builder 26.3.2
   - Test Electron 39.x with electron-builder 26.3.2
   - Document blockers or issues
   - **Decision Point:** If blocked, research alternatives (electron-forge, custom scripts)
   - **Creates Issue:** "Electron 38/39 Upgrade" (Epic)

**Implementation:**
2. **Electron 38/39 Upgrade** (4-6 days if compatible)
   - Upgrade Electron to 38.x or 39.x
   - Update electron-builder if needed
   - Test screen sharing (X11, Wayland, macOS, Windows)
   - Test authentication flow
   - Test all IPC channels
   - Cross-platform testing campaign
   - **Blocker:** electron-builder compatibility
   - **Risk:** Medium (breaking changes possible)
   - **Version:** v3.0.0 if breaking, v2.8.0 if not

**Deliverables:**
- Modern Electron platform
- Updated dependencies
- Performance improvements
- Security patches

**Total Effort:** ~1 week (if compatible), ~2 weeks (if blocked + workaround)

---

### Phase 3: User Experience Enhancements (Week 5-7)

**Milestone:** v2.9.0 or v3.1.0 - "Enhanced Experience"

**Goal:** Improve user awareness and flexibility

**Research Spikes:**
1. **Multiple Windows Feasibility** (#1984) (4-6 hours)
   - Can Teams web app run in multiple BrowserWindows?
   - DOM/React state sharing issues?
   - Authentication token sharing?
   - Memory/performance impact?
   - **Decision Point:** Implement, defer, or close as not feasible
   - **Creates Issue:** "Multiple Windows: Technical Feasibility Assessment"

2. **Audio Device Selection API** (#1965) (2-3 hours)
   - Electron's `navigator.mediaDevices.enumerateDevices()`
   - Can we set default audio device per app?
   - Platform limitations (Linux, macOS, Windows)
   - **Decision Point:** Full implementation vs documentation of workarounds

**Implementation:**
3. **Tray Icon Logged-Off Indicator** (#1987) - 1-2 days
   - Detect login/logout state
   - Change tray icon based on state
   - Configuration option (enabled/disabled)
   - Icon variants for different states
   - **Blocker:** None
   - **Risk:** Low

4. **Multiple Windows** (#1984) - 1-2 weeks (if feasible)
   - Create secondary BrowserWindow for chat
   - Share authentication state
   - Implement window management
   - Test memory/performance impact
   - **Blocker:** Feasibility research
   - **Risk:** High (may not be technically feasible)

5. **Multi Soundcard Support** (#1965) - 3-5 days
   - Add audio device selection UI
   - Persist device preferences
   - Handle device connect/disconnect
   - Platform-specific testing
   - **Blocker:** API research
   - **Risk:** Medium (platform-dependent)

**Deliverables:**
- Better tray icon awareness
- Multiple windows (if feasible)
- Audio device control (if fully supported)
- Or: Documentation of workarounds

**Total Effort:** ~2-3 weeks (depends on feasibility)

---

## Issues to Create

### Phase 1 Issues (Create Immediately)

#### 1. Calendar Data Export via MQTT Command
**Epic:** No (single implementation)
**Issue:** Enhancement to #1995
**Title:** Implement Calendar Data Export via MQTT Command
**Labels:** `enhancement`, `mqtt`, `graph-api`, `ready-for-implementation`
**Milestone:** v2.7.0
**Effort:** 2-3 hours
**Priority:** P0

**Description:**
Add MQTT `get-calendar` command to expose calendar data for external processing (org-mode, dashboards). User confirmed need.

**Acceptance Criteria:**
- [ ] Command `get-calendar` with startDate/endDate parameters
- [ ] Publishes raw Graph API JSON to `teams/calendar` topic
- [ ] Documentation with complete workflow examples
- [ ] Example Python script for org-mode conversion
- [ ] Example cron integration

---

#### 2. MQTT Extended Status Phase 1a: Call and Screen Sharing
**Epic:** Yes (Phase 1a + future Phase 1b)
**Issue:** Enhancement to #1938
**Title:** MQTT Extended Status Phase 1a: Call and Screen Sharing State
**Labels:** `enhancement`, `mqtt`, `ready-for-implementation`
**Milestone:** v2.7.0
**Effort:** 1-2 days
**Priority:** P0

**Description:**
Publish call and screen sharing state to MQTT for home automation (RGB LEDs, status boards). Simplified Phase 1a using existing IPC events. Phase 1b (camera/mic via WebRTC) comes later.

**Acceptance Criteria:**
- [ ] `teams/in-call` publishes `true`/`false` on call connect/disconnect
- [ ] `teams/screen-sharing` publishes `true`/`false` on screen share start/stop
- [ ] Configuration options for each topic
- [ ] Documentation with Home Assistant examples
- [ ] User (#1938) can integrate with RGB LEDs

**Follow-up Epic:** "MQTT Extended Status Phase 1b: Camera and Microphone" (WebRTC monitoring)

---

#### 3. Custom Tray Icons: Documentation and Bundled Variants
**Epic:** No (documentation + small enhancement)
**Issue:** Documentation for #2003
**Title:** Document Custom Tray Icons and Bundle Community Variants
**Labels:** `documentation`, `enhancement`, `good-first-issue`
**Milestone:** v2.7.0
**Effort:** 4-8 hours
**Priority:** P1

**Description:**
Users frequently ask about custom icons (#2003 is latest example). The app already supports custom icons via `appIcon` config, but it's not well documented. Create comprehensive guide and bundle popular community icon variants.

**Acceptance Criteria:**
- [ ] Documentation page: "Custom Tray Icons Guide"
  - How to use `appIcon` and `appIconType` config options
  - Icon file formats and sizes
  - Where to place custom icons
  - Example configurations
- [ ] Icon specification guide (PNG, SVG, sizes, transparency)
- [ ] Bundle 2-3 community icon variants in `app/assets/icons/community/`
  - Include icons from #2003 (with permission)
  - Document credits
- [ ] Add gallery to docs site showing available icons
- [ ] README updated with custom icons section

---

### Phase 2 Issues (Create After Research Spikes)

#### 4. Research Spike: Electron 38/39 Upgrade Compatibility
**Epic:** No (research spike)
**Issue:** New - Research spike
**Title:** Research: Electron 38/39 Upgrade Compatibility with electron-builder
**Labels:** `research`, `infrastructure`
**Milestone:** v2.8.0/v3.0.0
**Effort:** 2-4 hours
**Priority:** P0

**Description:**
Test compatibility of Electron 38.x and 39.x with latest electron-builder before committing to upgrade.

**Research Questions:**
- Does electron-builder 26.3.2 support Electron 38.2.x?
- Does electron-builder 26.3.2 support Electron 39.2.4?
- Are there any breaking changes in Electron 38/39 that affect us?
- If blocked: What are alternatives? (electron-forge, custom build scripts)

**Deliverables:**
- Compatibility matrix document
- List of blockers (if any)
- Recommendation: Electron 38, 39, or stay on 37
- Creates epic issue based on findings

**Outcome Decision Tree:**
- **If Compatible:** Create "Electron 38/39 Upgrade" epic
- **If Blocked:** Create "Evaluate electron-builder alternatives" spike
- **If Breaking Changes:** Document for v3.0.0 planning

---

#### 5. Epic: Electron 38/39 Upgrade
**Epic:** Yes (multi-task implementation)
**Issue:** New - Created after research spike
**Title:** Epic: Upgrade to Electron 38/39
**Labels:** `epic`, `infrastructure`, `breaking-change-candidate`
**Milestone:** v2.8.0 or v3.0.0
**Effort:** 4-6 days
**Priority:** P1
**Blocker:** Research spike (#4)

**Description:**
Upgrade to Electron 38.x or 39.x (decision based on research findings).

**Tasks:**
- [ ] Update package.json dependencies
- [ ] Test screen sharing (Linux X11, Wayland, macOS, Windows)
- [ ] Test authentication flow
- [ ] Test all IPC channels
- [ ] Test notifications
- [ ] Test window management
- [ ] Test global shortcuts
- [ ] Cross-platform builds (AppImage, deb, rpm, snap, macOS, Windows)
- [ ] Performance benchmarking vs v37
- [ ] Update documentation (breaking changes if any)
- [ ] Create release notes

**Version Decision:**
- No breaking changes → v2.8.0
- Breaking changes → v3.0.0

---

### Phase 3 Issues (Create After Feasibility Research)

#### 6. Tray Icon Logged-Off Indicator
**Epic:** No (single implementation)
**Issue:** Enhancement to #1987
**Title:** Add Tray Icon Indicator for Logged-Off State
**Labels:** `enhancement`, `ux`, `ready-for-implementation`
**Milestone:** v2.9.0/v3.1.0
**Effort:** 1-2 days
**Priority:** P1

**Description:**
Change tray icon to indicate when user is not logged into Teams. Improves user awareness of connection state.

**Proposed Behavior:**
- Logged in + connected: Normal icon
- Not logged in: Grayscale/dimmed icon or different icon variant
- Logged in but disconnected: Warning icon or badge overlay

**Acceptance Criteria:**
- [ ] Detect login/logout state
- [ ] Icon changes based on state
- [ ] Configuration option: `tray.showLoggedOffIndicator` (default: true)
- [ ] Icon variants for each state
- [ ] Works across all icon types (default, custom)
- [ ] Documentation updated

---

#### 7. Research Spike: Multiple Windows Feasibility
**Epic:** No (research spike)
**Issue:** New - Research for #1984
**Title:** Research: Multiple Windows Feasibility (Chat + Meeting)
**Labels:** `research`, `ux`
**Milestone:** v2.9.0/v3.1.0
**Effort:** 4-6 hours
**Priority:** P2

**Description:**
Investigate if we can open separate BrowserWindows for chat and meeting simultaneously.

**Research Questions:**
- Can Teams web app run in multiple BrowserWindows concurrently?
- How to share authentication state across windows?
- DOM/React state conflicts?
- Memory/performance impact?
- User workflow: How would users manage multiple windows?
- Alternative: Picture-in-picture for meeting, main window for chat?

**Test Approach:**
1. Create proof-of-concept with 2 BrowserWindows
2. Load Teams URL in both
3. Test authentication state sharing
4. Measure memory usage
5. Test core functionality in each window

**Deliverables:**
- Feasibility assessment document
- POC code (if feasible)
- Memory/performance metrics
- Recommendation: Implement, defer, or close as infeasible

**Outcome Decision Tree:**
- **Feasible:** Create "Multiple Windows" epic
- **Complex but possible:** Document approach, defer to later release
- **Not feasible:** Close #1984 with explanation and alternative suggestions

---

#### 8. Epic: Multiple Windows Support
**Epic:** Yes (multi-task implementation)
**Issue:** New - Created after research spike
**Title:** Epic: Multiple Windows Support (Chat + Meeting)
**Labels:** `epic`, `enhancement`, `ux`
**Milestone:** v3.0.0 or later
**Effort:** 1-2 weeks
**Priority:** P2
**Blocker:** Research spike (#7)

**Description:**
Enable opening separate windows for chat and meeting simultaneously (if feasible).

**Proposed Architecture:**
- Main Window: Chat, channels, teams list
- Meeting Window: Active meeting with controls
- Shared authentication state
- Tray menu to manage windows

**Tasks:**
- [ ] Create secondary BrowserWindow class
- [ ] Implement authentication state sharing
- [ ] Window management (open, close, focus)
- [ ] Memory optimization (unload inactive windows)
- [ ] IPC channels for window communication
- [ ] Tray menu integration
- [ ] Configuration options
- [ ] Cross-platform testing
- [ ] Documentation

---

#### 9. Research Spike: Audio Device Selection API
**Epic:** No (research spike)
**Issue:** New - Research for #1965
**Title:** Research: Audio Device Selection API Capabilities
**Labels:** `research`, `audio`
**Milestone:** v2.9.0/v3.1.0
**Effort:** 2-3 hours
**Priority:** P2

**Description:**
Investigate Electron's capabilities for audio device selection and routing.

**Research Questions:**
- Can Electron set default audio input/output devices?
- `navigator.mediaDevices.enumerateDevices()` capabilities?
- Platform limitations (Linux/PulseAudio, macOS, Windows)?
- Can we persist device preferences?
- Handle device connect/disconnect events?

**Deliverables:**
- API capabilities document
- Platform-specific limitations
- Implementation approach recommendation
- Alternative: Document workarounds if full control not possible

**Outcome Decision Tree:**
- **Full API support:** Create "Multi Soundcard" implementation issue
- **Limited API:** Implement basic device selection + document workarounds
- **No API support:** Document platform-specific workarounds, close #1965

---

#### 10. Multi Soundcard Support
**Epic:** No (single implementation, medium complexity)
**Issue:** Enhancement to #1965
**Title:** Add Audio Device Selection UI
**Labels:** `enhancement`, `audio`
**Milestone:** v2.9.0/v3.1.0
**Effort:** 3-5 days
**Priority:** P2
**Blocker:** Research spike (#9)

**Description:**
Allow users to select audio input/output devices for Teams calls.

**Acceptance Criteria:**
- [ ] Settings menu: Audio device selection
- [ ] List available input devices (microphones)
- [ ] List available output devices (speakers)
- [ ] Persist device preferences in config
- [ ] Apply devices when joining call
- [ ] Handle device connect/disconnect
- [ ] Platform-specific testing (Linux, macOS, Windows)
- [ ] Documentation with platform limitations

---

## Project Timeline

### Gantt Chart Overview

```
Week 1-2: Phase 1 - Quick Wins
├── Calendar Export (2-3 hours)
├── MQTT Extended Status 1a (1-2 days)
└── Custom Icons Documentation (4-8 hours)
    → Release v2.7.0

Week 3-4: Phase 2 - Platform Modernization
├── Electron Research Spike (2-4 hours)
└── Electron 38/39 Upgrade (4-6 days if compatible)
    → Release v2.8.0 or v3.0.0

Week 5-7: Phase 3 - User Experience
├── Tray Logged-Off Indicator (1-2 days)
├── Multiple Windows Research (4-6 hours)
├── Audio Device Research (2-3 hours)
├── Multiple Windows Implementation (1-2 weeks if feasible)
└── Multi Soundcard (3-5 days if API supports)
    → Release v2.9.0 or v3.1.0
```

---

## Dependencies Graph

```
Phase 1 (Parallel - No Blockers)
├── Calendar Export → Release v2.7.0
├── MQTT Extended Status 1a → Release v2.7.0
└── Custom Icons Docs → Release v2.7.0

Phase 2 (Sequential)
├── Electron Research Spike
    ├── If Compatible → Electron Upgrade → Release v2.8.0/v3.0.0
    └── If Blocked → Evaluate Alternatives

Phase 3 (Mixed Dependencies)
├── Tray Logged-Off → No blockers → Can implement anytime
├── Multiple Windows Research
    ├── If Feasible → Multiple Windows Implementation
    └── If Infeasible → Close #1984
└── Audio Device Research
    ├── Full API → Multi Soundcard Implementation
    ├── Limited API → Basic implementation + docs
    └── No API → Document workarounds
```

---

## Risk Assessment

### Phase 1 Risks: LOW
- All features use existing infrastructure
- No external blockers
- Clear requirements
- Mitigation: None needed

### Phase 2 Risks: MEDIUM
- electron-builder may not support Electron 38/39
- Electron upgrade may introduce breaking changes
- Screen sharing may break on some platforms
- Mitigation: Research spike first, extensive testing, keep rollback plan

### Phase 3 Risks: MEDIUM-HIGH
- Multiple windows may not be technically feasible (Teams web app constraints)
- Audio device selection may have limited platform support
- Tray icon changes may conflict with some desktop environments
- Mitigation: Research spikes before committing, have fallback plans

---

## Success Metrics

### Phase 1 Success
- [ ] v2.7.0 released on time
- [ ] Users successfully export calendar to org-mode
- [ ] Users integrate call state with home automation
- [ ] Custom icon documentation resolves recurring asks
- [ ] Zero regressions

### Phase 2 Success
- [ ] Electron 38/39 upgrade successful OR clear decision to stay on v37
- [ ] All platforms work (Linux, macOS, Windows)
- [ ] Screen sharing functional on all environments
- [ ] Performance equal or better than v37
- [ ] Zero regressions

### Phase 3 Success
- [ ] Tray icon logged-off indicator well-received
- [ ] Multiple windows: Clear decision (implement, defer, or close)
- [ ] Multi soundcard: Clear decision (implement, document workarounds, or close)
- [ ] User feedback positive
- [ ] Zero regressions

---

## Communication Plan

### Project Announcement

**Title:** "Project Integration & Experience 2025"

**Key Messages:**
- Better external integration (MQTT automation, calendar export)
- Modern platform (Electron 38/39)
- Enhanced user experience (tray indicators, custom icons, multi-window, audio control)
- Three-phase release strategy for continuous value delivery

**Channels:**
- GitHub Discussion
- Release notes
- Documentation site announcement
- README updates

### Testing Call-Out

**Phase 2 needs testers:**
- Linux (X11, Wayland, various DEs)
- macOS (multiple versions)
- Windows (10, 11)
- Multi-monitor setups
- Screen sharing focus

**Phase 3 needs testers:**
- Multiple windows workflow feedback
- Audio device selection on different platforms
- Tray icon visibility across themes

---

## Issue Creation Summary

### Create Immediately (Phase 1)

1. **Calendar Data Export** - Enhancement to #1995
2. **MQTT Extended Status Phase 1a** - Enhancement to #1938
3. **Custom Icons Documentation** - Enhancement to #2003

**Total:** 3 issues

### Create After Research (Phase 2)

4. **Electron Research Spike** - New research issue
5. **Electron 38/39 Upgrade Epic** - Created based on spike outcome

**Total:** 2 issues (1 immediate spike, 1 conditional epic)

### Create After Research (Phase 3)

6. **Tray Logged-Off Indicator** - Enhancement to #1987
7. **Multiple Windows Research Spike** - New research issue
8. **Multiple Windows Epic** - Created if feasible
9. **Audio Device Research Spike** - New research issue
10. **Multi Soundcard Implementation** - Enhancement to #1965 (if API supports)

**Total:** 5 issues (2 spikes + 1 direct implementation + 2 conditional)

---

## Next Actions

### This Week

1. **Review and approve this plan**
2. **Create Phase 1 issues** (3 issues)
3. **Create Phase 2 research spike** (1 issue: Electron compatibility)
4. **Set up GitHub Project board:** "Integration & Experience 2025"
5. **Create milestones:**
   - v2.7.0 - External Integration & Quick Wins
   - v2.8.0/v3.0.0 - Platform Modernization
   - v2.9.0/v3.1.0 - Enhanced Experience

### Next Week

6. **Start Phase 1 implementation:**
   - Calendar Export (2-3 hours)
   - MQTT Extended Status (1-2 days)
   - Custom Icons Docs (4-8 hours)

7. **Run Electron research spike**
   - Test compatibility
   - Document findings
   - Create Epic or alternative plan

---

## Appendix: Phase 1 Issue Templates

Detailed issue templates ready to copy into GitHub...

(See next document for full issue templates)

---

**Document Status:** Draft v1.0 - Ready for Review
**Next Update:** After approval and Phase 1 kickoff
