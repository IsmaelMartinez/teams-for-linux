# Teams for Linux - Project Plan: Enhanced Integration & Connectivity

**Project Code Name:** "Integration 2025"
**Version Target:** v2.7.0 or v3.0.0 (TBD based on Electron breaking changes)
**Status:** Planning Phase
**Created:** 2025-11-29

---

## Project Theme

**"Enhanced Integration & Connectivity"**

This project focuses on improving how Teams for Linux integrates with external systems and provides better user awareness of connection states.

**Core Pillars:**
1. **External Integration** - MQTT automation, calendar export
2. **Platform Modernization** - Electron 38/39 upgrade
3. **User Awareness** - Visual indicators for connection states
4. **Workflow Enhancement** - Better multitasking within Teams

---

## Confirmed Features & Issues

### ✅ Confirmed Issues (Research Complete)

| Issue # | Feature | Effort | Priority | User Demand |
|---------|---------|--------|----------|-------------|
| #1995 | Calendar Data Export via MQTT | 2-3 hours | High | ✅ Confirmed |
| #1938 | MQTT Extended Status (Call/Screen Sharing) | 1-2 days | High | ✅ Confirmed |
| - | Electron 38/39 Upgrade | 4-6 days | High | Platform modernization |

### ❓ Needs Issue Numbers

**From user description:**
1. **Chat with other users while in a meeting** - Issue #?
   - Description needed: Can you provide the issue number or describe the feature request?
   - Expected capability: Open chat sidebar during meeting?

2. **Tray icon to indicate when logged off** - Issue #?
   - Description needed: Can you provide the issue number?
   - Expected behavior: Gray icon when not logged in? Red X when disconnected?

---

## Proposed Project Structure

### Theme: Enhanced Integration & Connectivity

**Project Goal:** Make Teams for Linux more aware of its state and better integrated with external systems.

### Feature Grouping

#### Track 1: External System Integration (MQTT & APIs)
- Calendar Data Export (#1995)
- MQTT Extended Status Phase 1a (#1938)
- Future: MQTT Extended Status Phase 1b (Camera/Mic)

#### Track 2: Platform Modernization
- Electron 38 or 39 Upgrade
- electron-builder compatibility verification
- Screen sharing improvements (if any from Electron upgrade)

#### Track 3: User Awareness & Experience
- Tray icon logged-off indicator (Issue #?)
- Chat while in meeting (Issue #?)
- Visual connection state indicators

---

## Project Phases

### Phase 1: Quick Wins & External Integration (1 week)

**Milestone:** "External Integration Ready"

**Tasks:**
1. **Calendar Data Export** (2-3 hours)
   - Issue: #1995
   - Description: Add MQTT command to expose calendar data
   - Dependencies: Graph API (already implemented)
   - Priority: P0 (user confirmed, fastest win)
   - Assignee: TBD

2. **MQTT Extended Status Phase 1a** (1-2 days)
   - Issue: #1938
   - Description: Publish call + screen sharing state to MQTT
   - Dependencies: MQTT client (already implemented)
   - Priority: P0 (user confirmed, high value)
   - Assignee: TBD

**Deliverable:** Users can integrate Teams state with external systems (home automation, org-mode)

---

### Phase 2: Platform Modernization (1 week)

**Milestone:** "Modern Electron Platform"

**Tasks:**
3. **Verify electron-builder Compatibility**
   - Description: Test Electron 38.x and 39.x with latest electron-builder
   - Priority: P0 (prerequisite for upgrade)
   - Effort: 2-4 hours
   - Outcome: Documented compatibility matrix

4. **Electron Upgrade** (4-6 days if compatible)
   - Target: Electron 39.2.4 (latest stable)
   - Description: Upgrade Electron + test all functionality
   - Dependencies: electron-builder verification
   - Priority: P1
   - Testing focus:
     - Screen sharing (X11, Wayland)
     - Authentication flow
     - IPC channels
     - Notifications
     - All platforms (Linux, macOS, Windows)

**Deliverable:** Modern Electron platform with latest security and features

---

### Phase 3: User Awareness Features (depends on issue details)

**Milestone:** "Enhanced User Experience"

**Tasks:**
5. **Tray Icon Logged-Off Indicator** (Issue #?)
   - Description: _Needs clarification_
   - Proposed behavior:
     - Option A: Change tray icon when not logged in
     - Option B: Show badge/overlay on tray icon
     - Option C: Change icon based on connection state
   - Effort: 1-2 days (estimate)
   - Priority: P2

6. **Chat While in Meeting** (Issue #?)
   - Description: _Needs clarification_
   - Proposed capability:
     - Option A: Allow opening chat panel during meetings
     - Option B: Picture-in-picture meeting + chat
     - Option C: Window management for multi-tasking
   - Effort: 3-5 days (estimate, depends on approach)
   - Priority: P2

**Deliverable:** Better visibility of Teams connection/login state, improved multitasking

---

## Implementation Order

### Recommended Sequence

**Week 1: External Integration Quick Wins**
```
Day 1:     Calendar Data Export (#1995)
Day 2-3:   MQTT Extended Status Phase 1a (#1938)
Day 4:     Testing + documentation
Day 5:     Buffer for issues
```

**Week 2: Platform Modernization**
```
Day 1:     electron-builder compatibility testing
Day 2-3:   Electron upgrade (if compatible)
Day 4-5:   Cross-platform testing
Day 5:     Release v2.7.0 or v3.0.0-beta
```

**Week 3+: User Awareness (after issue clarification)**
```
TBD based on issue details and priority
```

### Dependencies Graph

```
Calendar Export (#1995)
  ↓ (no dependencies, can start immediately)
  ✓ Graph API exists

MQTT Extended Status (#1938)
  ↓ (no dependencies, can start immediately)
  ✓ MQTT client exists
  ✓ IPC events exist

Electron Upgrade
  ↓ (prerequisite check required)
  ? electron-builder compatibility

Tray Logged-Off (Issue #?)
  ↓ (needs requirements)
  ? Issue details needed

Chat in Meeting (Issue #?)
  ↓ (needs requirements)
  ? Issue details needed
```

---

## Risk Assessment

### High Priority Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| electron-builder incompatible with Electron 38/39 | Medium | High | Test first, document alternatives (switch builder?) |
| Electron upgrade breaks screen sharing | Low | High | Extensive testing, keep v37 branch |
| Chat-while-in-meeting technically infeasible | Medium | Medium | Research Teams DOM structure first |
| MQTT features don't meet user needs | Low | Low | User already confirmed requirements |

### Medium Priority Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Tray icon changes conflict with OS themes | Medium | Low | Provide multiple icon variants |
| Calendar export Graph API limitations | Low | Medium | Document limitations clearly |
| Cross-platform testing reveals platform-specific bugs | Medium | Medium | Test early, allocate buffer time |

---

## Success Criteria

### Phase 1 Success Criteria
- [ ] User (#1995) successfully exports calendar to org-mode
- [ ] User (#1938) successfully integrates call state with RGB LEDs
- [ ] MQTT messages published with < 1s latency
- [ ] Zero breaking changes to existing functionality
- [ ] Documentation complete with examples

### Phase 2 Success Criteria
- [ ] Electron 38 or 39 running successfully
- [ ] Screen sharing works on Linux (X11 + Wayland), macOS, Windows
- [ ] All IPC channels functional
- [ ] Authentication flow works
- [ ] Zero regressions in core functionality
- [ ] Performance equal or better than v37

### Phase 3 Success Criteria (TBD)
- [ ] Tray icon clearly indicates login/connection state
- [ ] Chat-while-in-meeting feature works as expected
- [ ] User feedback positive
- [ ] No new bugs introduced

---

## Questions Needing Answers

### For Tray Icon Logged-Off Feature

1. **What is the issue number?**
2. **What should the visual indicator look like?**
   - Gray icon when logged off?
   - Red badge/overlay?
   - Different icon entirely?
3. **What states should be indicated?**
   - Not logged in
   - Logged in
   - Connection lost (while logged in)
   - Other states?

### For Chat While in Meeting Feature

1. **What is the issue number?**
2. **What is the desired behavior?**
   - Open chat sidebar during meeting?
   - Picture-in-picture meeting window?
   - Separate chat window?
   - Keyboard shortcut to toggle chat?
3. **Is this a Teams web app limitation or Teams for Linux limitation?**
4. **Are there existing workarounds users are trying to replicate?**

### For Electron Upgrade

1. **Should we target Electron 38 (stable, tested) or Electron 39 (latest)?**
2. **Are there specific features in Electron 38/39 that motivated this upgrade?**
3. **Is this blocking any other features?**

---

## Release Strategy

### Option A: Incremental Releases (Recommended)

**v2.7.0 - External Integration** (Week 1)
- Calendar Export
- MQTT Extended Status Phase 1a
- Quick win, low risk

**v2.8.0 or v3.0.0 - Platform Modernization** (Week 2-3)
- Electron 38/39 upgrade
- Breaking changes if any → v3.0.0
- No breaking changes → v2.8.0

**v2.9.0 / v3.1.0 - User Experience** (Week 4+)
- Tray icon logged-off indicator
- Chat while in meeting
- Polish and refinements

### Option B: Big Bang Release

**v3.0.0 - Integration & Connectivity** (3-4 weeks)
- All features together
- Single announcement
- More testing needed
- Higher risk

**Recommendation:** Option A (Incremental) for faster user value and lower risk

---

## Project Tracking

### GitHub Project Board Structure

**Columns:**
1. **📋 Backlog** - All planned features
2. **🔍 Needs Clarification** - Issues needing more details
3. **✅ Ready** - Issues ready to implement
4. **🚧 In Progress** - Currently being worked on
5. **🧪 Testing** - Implementation complete, testing in progress
6. **📝 Documentation** - Needs docs updates
7. **✔️ Done** - Complete and released

### Milestone Structure

**Milestone 1: External Integration (v2.7.0)**
- Calendar Export (#1995)
- MQTT Extended Status (#1938)
- Target: Week 1

**Milestone 2: Platform Modernization (v2.8.0 or v3.0.0)**
- Electron Upgrade
- electron-builder compatibility
- Target: Week 2-3

**Milestone 3: User Experience Enhancements (v2.9.0 or v3.1.0)**
- Tray icon logged-off indicator
- Chat while in meeting
- Target: Week 4+

---

## Communication Plan

### Project Announcement

**Draft Title:** "Project Integration 2025: Enhanced External System Support & Platform Modernization"

**Key Messages:**
- Better integration with home automation and productivity tools (MQTT, calendar export)
- Modern Electron platform (Electron 38/39)
- Improved user awareness of connection states
- Better multitasking within Teams

**Target Audience:**
- Advanced users with home automation setups
- Users who integrate Teams with other tools
- Contributors wanting to help with testing

**Communication Channels:**
- GitHub Discussion post
- Release notes
- README.md updates
- Documentation site announcement banner

### Testing Call-Out

For Electron upgrade, we'll need:
- Linux testers (X11 and Wayland)
- macOS testers (especially screen sharing)
- Windows testers
- Multi-monitor setups
- Various desktop environments (GNOME, KDE, etc.)

---

## Next Steps (Action Items)

### Immediate (This Week)

1. **Clarify missing issues:**
   - [ ] Get issue number for "chat while in meeting" feature
   - [ ] Get issue number for "tray icon logged-off indicator" feature
   - [ ] Understand requirements for both features

2. **Create GitHub issues:**
   - [ ] Calendar Data Export (#1995 enhancement)
   - [ ] MQTT Extended Status Phase 1a (#1938 enhancement)
   - [ ] Electron 38/39 upgrade investigation (new issue)
   - [ ] Tray icon logged-off indicator (pending clarification)
   - [ ] Chat while in meeting (pending clarification)

3. **Set up project tracking:**
   - [ ] Create GitHub Project board: "Integration 2025"
   - [ ] Create milestones (v2.7.0, v2.8.0/v3.0.0, v2.9.0/v3.1.0)
   - [ ] Assign issues to milestones
   - [ ] Set up project board columns

### Short-Term (Week 1)

4. **Start implementation:**
   - [ ] Calendar Export (2-3 hours)
   - [ ] MQTT Extended Status Phase 1a (1-2 days)
   - [ ] Create documentation PRs
   - [ ] Set up testing checklist

### Medium-Term (Week 2-3)

5. **Platform modernization:**
   - [ ] Test electron-builder with Electron 38/39
   - [ ] If compatible: upgrade and test extensively
   - [ ] If incompatible: research alternatives (forge, custom scripts)
   - [ ] Cross-platform testing campaign

6. **Documentation updates:**
   - [ ] MQTT integration examples
   - [ ] Calendar export workflow
   - [ ] Electron upgrade notes (if applicable)

---

## Appendix: Issue Templates Ready to Create

### Issue Template: Calendar Data Export

See `GITHUB_ISSUES_SIMPLIFIED.md` - Issue 1

### Issue Template: MQTT Extended Status Phase 1a

See `GITHUB_ISSUES_SIMPLIFIED.md` - Issue 2

### Issue Template: Electron 38/39 Upgrade (Draft)

**Title:** Investigate and Implement Electron 38/39 Upgrade

**Labels:** `infrastructure`, `breaking-change-candidate`

**Description:**
Test and upgrade to Electron 38.x or 39.x to modernize the platform.

**Tasks:**
- [ ] Test electron-builder compatibility with Electron 38.2.x
- [ ] Test electron-builder compatibility with Electron 39.2.4
- [ ] Document any breaking changes or blockers
- [ ] If compatible: Implement upgrade
- [ ] If incompatible: Research alternative build tools
- [ ] Extensive cross-platform testing

**Target:** Electron 39.2.4 (latest stable)

### Issue Template: Tray Icon Logged-Off Indicator (Pending Details)

**Title:** TBD - Needs issue number and requirements

### Issue Template: Chat While in Meeting (Pending Details)

**Title:** TBD - Needs issue number and requirements

---

## Document Status

- **Version:** 1.0 (Draft)
- **Last Updated:** 2025-11-29
- **Status:** Awaiting issue clarification and approval
- **Next Review:** After issue numbers and requirements provided
