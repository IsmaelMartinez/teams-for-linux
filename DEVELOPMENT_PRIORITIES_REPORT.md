# Teams for Linux Development Priorities Report

**Generated:** 2025-11-28
**Based on:** Research documents in `docs-site/docs/development/research/`

## Executive Summary

This report analyzes the current research documentation to identify the next development priorities for Teams for Linux. The project has successfully completed several major initiatives (incremental refactoring, Graph API POC, custom notifications MVP, MQTT commands) and now has a clear set of follow-up work items ready for implementation.

## Status Overview

### ✅ Completed Research & Implementation
- **Incremental Refactoring** - 55% reduction in index.js (archived old DDD approach)
- **Graph API Integration Phase 1** - POC complete with basic endpoints
- **Custom Notification System MVP** - Toast notifications released in v2.6.16
- **MQTT Commands** - Bidirectional MQTT support implemented
- **Configuration Documentation** - MQTT docs added, deprecated options removed

### 🔄 Research Complete - Ready for Implementation
- **MQTT Extended Status** - Camera/mic/call state monitoring
- **Calendar Data Export** - MQTT-based calendar access
- **Electron 38 Migration** - Framework upgrade with screensharing improvements
- **Automated Testing Strategy** - Playwright + Vitest framework selection

### 📋 Research Complete - Awaiting Decision
- **Custom Notification Phase 2** - Notification center (awaiting user feedback)
- **Graph API Phase 2** - Enhanced features (calendar sync, presence, mail)
- **Configuration Organization Phase 2** - Nested config structure migration
- **DOM Access Phase 2** - Hybrid API + DOM approach for resilience

---

## Priority Ranking

### Tier 1: High Impact, Low Risk (Implement Next)

#### 1. MQTT Extended Status Implementation
**Effort:** 1-2 weeks
**Risk:** Low
**Impact:** High
**User Demand:** Direct user request (#1938)

**Why Now:**
- User explicitly requested for RGB LED automation
- Leverages existing infrastructure (MQTT client, IPC channels)
- Clear architecture documented with service pattern
- WebRTC monitoring is stable API, low fragility
- Completes MQTT feature set (status publishing + commands + extended status)

**What to Build:**
- `app/mqtt/mediaStatusService.js` - Service to publish camera/mic/call state
- `app/browser/tools/mediaStatus.js` - WebRTC stream monitoring
- Configuration for camera/microphone/call topics
- Update IPC security allowlist

**Expected Outcome:**
Users can integrate Teams state with home automation (RGB LEDs, lights, status boards).

---

#### 2. Calendar Data Export via MQTT
**Effort:** 2-3 hours
**Risk:** Low
**Impact:** Medium
**User Demand:** Direct user request (#1995)

**Why Now:**
- User explicitly requested for org-mode integration
- Graph API infrastructure already exists (Phase 1 complete)
- MQTT infrastructure already exists
- Minimal code changes (~20 lines)
- Follows established MQTT command pattern

**What to Build:**
- Add `get-calendar` command handler to MQTT
- Publish calendar data to `teams/calendar` topic
- Documentation for user workflow
- Example scripts for external processing

**Expected Outcome:**
Users can export calendar data for external tools (org-mode, custom dashboards) without maintaining separate auth.

---

#### 3. Automated Testing Foundation (Quick Wins)
**Effort:** 1-2 weeks for Phase 1
**Risk:** Low
**Impact:** High (long-term quality)
**User Demand:** Indirect (reduces bugs)

**Why Now:**
- Research complete with clear framework selection (Playwright + Vitest)
- Basic E2E test already exists (`tests/e2e/smoke.spec.js`)
- Prevents regressions as features grow
- Foundation for future test expansion
- Low barrier to entry (30-minute quick start documented)

**What to Build:**
- Expand E2E tests to cover core workflows (app launch, Teams login)
- Add unit tests for critical modules (config, IPC validation, MQTT)
- Set up CI/CD pipeline for automated testing
- Establish testing patterns for contributors

**Expected Outcome:**
Reduced regression bugs, faster review cycles, higher contributor confidence.

---

### Tier 2: Medium Impact, Medium Effort (Plan for Future)

#### 4. Electron 38 Migration
**Effort:** 4-6 days
**Risk:** Medium
**Impact:** Medium-High
**User Demand:** Indirect (platform modernization)

**Why Later:**
- Requires dedicated testing across platforms
- Screensharing modernization needs careful validation
- Electron 37 is stable and working well currently
- Should align with major version bump (v3.0?)

**What to Build:**
- Update to Electron ^38.2.1
- Modernize screensharing implementation
- Test on Linux (X11/Wayland), macOS, Windows
- Update documentation for platform-specific changes

**Expected Outcome:**
Modern Electron platform, simplified screensharing code, native system picker support.

---

#### 5. Configuration Organization Phase 1 Completion
**Effort:** 1-2 hours
**Risk:** Zero (docs only)
**Impact:** Medium (user experience)
**User Demand:** Indirect (discoverability)

**Why Later:**
- Partial completion already done (MQTT docs, deprecated options removed)
- Documentation-only change, zero breaking changes
- Nice-to-have rather than critical
- Can be done alongside other work

**What to Build:**
- Reorganize configuration.md into logical categories
- Improve grouping of related options
- Add cross-references between related settings

**Expected Outcome:**
Easier configuration discovery, better user onboarding.

---

### Tier 3: Awaiting User Feedback / Future Consideration

#### 6. Custom Notification Phase 2 (Notification Center)
**Effort:** 1-2 weeks
**Risk:** Medium
**Impact:** Medium
**User Demand:** Unknown (awaiting feedback on MVP)

**Why Wait:**
- MVP released in v2.6.16, needs field testing
- Should validate user demand before building complex UI
- Notification center adds significant complexity
- Alternative: Enhanced toast features might be more valuable

**Decision Point:**
Monitor GitHub issues for 2-4 weeks post-MVP. If users request history/notification panel, prioritize. Otherwise, consider toast enhancements or skip Phase 2.

---

#### 7. Graph API Phase 2 (Enhanced Features)
**Effort:** 2-4 weeks
**Risk:** Medium
**Impact:** Medium
**User Demand:** Low (no direct requests)

**Why Wait:**
- Phase 1 POC complete but limited usage so far
- Calendar sync, presence, mail integration are speculative
- Should validate Phase 1 adoption first
- Presence endpoint returns 403 (Teams token lacks scope)

**Decision Point:**
If calendar export (#1995) drives adoption, consider calendar sync features. Otherwise, wait for user requests.

---

#### 8. Configuration Organization Phase 2-3 (Nested Structure)
**Effort:** 3-4 weeks
**Risk:** Medium
**Impact:** Medium
**User Demand:** Low (internal improvement)

**Why Wait:**
- Significant refactoring effort
- Auto-migration adds complexity
- Current flat structure works, just less organized
- Better aligned with v3.0 major version

**Decision Point:**
Plan for v3.0 release to align with other breaking changes (if any) or Electron 38 migration.

---

#### 9. DOM Access Phase 2 (Hybrid API + DOM)
**Effort:** 4-6 weeks
**Risk:** High
**Impact:** High (future resilience)
**User Demand:** None (preventive)

**Why Wait:**
- Current DOM access stable with React monitoring
- Teams hasn't upgraded React yet (timeline unknown)
- Significant architecture change
- Better to wait for actual React breaking change signal

**Decision Point:**
Monitor Teams React version. If upgrade to React 18/19 is announced, prioritize immediately. Otherwise, keep monitoring.

---

## Implementation Roadmap

### Immediate (Next 1-2 Months)

**Sprint 1: MQTT Feature Completion**
- Week 1-2: MQTT Extended Status (#1938)
- Week 2: Calendar Data Export (#1995)
- Outcome: Complete MQTT integration suite

**Sprint 2: Testing Foundation**
- Week 3-4: Expand E2E tests (Playwright)
- Week 4-5: Add unit tests for critical modules (Vitest)
- Week 5: CI/CD pipeline setup
- Outcome: Automated testing infrastructure

### Near-Term (3-6 Months)

**Major Version Planning (v3.0?)**
- Electron 38 Migration (4-6 days)
- Configuration Organization Phase 2-3 (3-4 weeks)
- Breaking changes coordination
- Comprehensive testing before release

**User Feedback-Driven**
- Custom Notification Phase 2 (if requested)
- Graph API Phase 2 features (if calendar export drives demand)

### Long-Term (6+ Months)

**Resilience & Modernization**
- DOM Access Phase 2 (when Teams React upgrade approaches)
- Additional testing coverage expansion
- Performance optimizations

---

## Recommended Issue Creation

### Issues to Create Now

1. **MQTT Extended Status: Camera/Mic/Call State Monitoring**
   - Reference: #1938, `mqtt-extended-status-investigation.md`
   - Labels: `enhancement`, `mqtt`, `ready-for-implementation`
   - Assignee: TBD
   - Milestone: Next release

2. **Calendar Data Export via MQTT Command**
   - Reference: #1995, `calendar-data-export-research.md`
   - Labels: `enhancement`, `mqtt`, `graph-api`, `ready-for-implementation`
   - Assignee: TBD
   - Milestone: Next release

3. **Automated Testing: Expand E2E Test Coverage**
   - Reference: `automated-testing-strategy.md`
   - Labels: `testing`, `infrastructure`, `good-first-issue`
   - Assignee: TBD
   - Milestone: Next release

4. **Automated Testing: Add Unit Tests for Core Modules**
   - Reference: `automated-testing-strategy.md`
   - Labels: `testing`, `infrastructure`
   - Assignee: TBD
   - Milestone: Next release

### Issues to Create Later (After Validation)

5. **Configuration Documentation Reorganization (Phase 1 Completion)**
   - Reference: `configuration-organization-research.md`
   - Labels: `documentation`, `good-first-issue`
   - Assignee: TBD
   - Milestone: Backlog

6. **Electron 38 Migration Planning**
   - Reference: `electron-38-migration-analysis.md`
   - Labels: `infrastructure`, `breaking-change`
   - Assignee: TBD
   - Milestone: v3.0

7. **Custom Notification Phase 2: Notification Center** (Create after MVP feedback)
   - Reference: `custom-notification-system-research.md`
   - Labels: `enhancement`, `notifications`, `awaiting-feedback`
   - Assignee: TBD
   - Milestone: Future

---

## Success Metrics

### For Tier 1 Priorities

**MQTT Extended Status:**
- Users successfully integrate with home automation (GitHub feedback)
- Camera/mic/call state accurately reflects Teams state
- Zero performance regression

**Calendar Export:**
- Users successfully export to org-mode and other tools
- Graph API integration remains stable
- Positive user feedback on workflow

**Automated Testing:**
- E2E tests cover app launch, login, core features
- Unit tests achieve >50% coverage of critical modules
- CI/CD pipeline runs tests on all PRs
- Test execution time < 5 minutes

### For Future Priorities

**Electron 38:**
- Zero regressions in core functionality
- Screensharing works on all platforms
- Code reduction achieved (~30% in screensharing)

**Configuration Organization:**
- Auto-migration works without user intervention
- Zero breaking changes
- Improved user feedback on discoverability

---

## Risk Mitigation

### For Tier 1 Implementations

**MQTT Extended Status:**
- Use proven WebRTC APIs (low fragility)
- Follow established service pattern
- Extensive testing with real Teams calls
- Feature flag for gradual rollout

**Calendar Export:**
- Minimal code changes (low risk)
- Leverage existing Graph API infrastructure
- Document external processing workflow clearly
- User controls all scheduling (no internal polling)

**Automated Testing:**
- Start with smoke tests, expand incrementally
- Don't block development on test coverage targets
- Focus on high-value, stable test cases
- Use authentication storage state to avoid repeated login

---

## Conclusion

The Teams for Linux project has a healthy pipeline of research-backed initiatives. The recommended approach is:

1. **Implement Tier 1 priorities immediately** - High impact, low risk, user-requested features
2. **Plan Tier 2 priorities for future releases** - Align with major versions or validation milestones
3. **Keep Tier 3 priorities in backlog** - Await user feedback or external triggers

This prioritization balances:
- **User value** - Direct user requests (#1938, #1995) prioritized
- **Technical debt** - Testing foundation reduces future bugs
- **Risk management** - Low-risk implementations first
- **Resource efficiency** - Leverage existing infrastructure (MQTT, Graph API)

**Next Steps:**
1. Create GitHub issues for Tier 1 priorities (see "Issues to Create Now" section)
2. Assign to maintainer/contributor for implementation
3. Set milestone for next release
4. Begin implementation in priority order

---

## Appendix: Research Document Status Matrix

| Research Document | Status | Next Phase | Effort | Priority |
|-------------------|--------|------------|--------|----------|
| Architecture Modernization | ✅ Archived (Complete) | N/A | N/A | N/A |
| Graph API Integration | ✅ Phase 1 Complete | Phase 2 (Calendar Sync, Mail) | 2-4 weeks | Tier 3 |
| Custom Notifications | ✅ MVP Complete | Phase 2 (Notification Center) | 1-2 weeks | Tier 3 |
| Electron 38 Migration | 📋 Research Complete | Phase 1 (Core Upgrade) | 4-6 days | Tier 2 |
| Automated Testing | 📋 Research Complete | Phase 1 (Foundation) | 1-2 weeks | Tier 1 |
| MQTT Commands | ✅ Implemented | N/A | N/A | N/A |
| Calendar Export | 📋 Research Complete | Implementation | 2-3 hours | Tier 1 |
| MQTT Extended Status | 📋 Ready for Implementation | Implementation | 1-2 weeks | Tier 1 |
| DOM Access Investigation | ✅ Phase 1 Complete | Phase 2 (Hybrid API) | 4-6 weeks | Tier 3 |
| Configuration Organization | 🔄 Phase 1 Partial | Phase 1 Completion | 1-2 hours | Tier 2 |

**Legend:**
- ✅ Complete
- 🔄 In Progress
- 📋 Ready
- ⏸️ Blocked/Waiting
