# Issue Investigation - September 2, 2025

## Summary
Investigation of critical GitHub issues focusing on Project 2.0 compatibility and high-impact bugs affecting teams-for-linux users.

## Critical Issues Analysis

### Project 2.0 Priority Issues

| Issue | Title | Priority | Status | Notes |
|-------|-------|----------|--------|-------|
| #1234 | Meeting notifications not working with "new teams" | **Critical** | Actionable | Teams v2 compatibility blocker. Potential MS API integration fix |
| #1799 | Architecture Modernization – Investigate and Plan Domain-Driven Repo Structure | **High** | Actionable | Foundation for 2.0. Strategic decision needed |
| #1800 | Screen sharing echo issue | **High** | Needs investigation | 27 comments, likely related to new screen sharing functionality |

### Secondary Priority Issues

| Issue | Title | Priority | Status | Notes |
|-------|-------|----------|--------|-------|
| #1357 | "Please sign in again" persistent issue | **Medium** | Needs logging | 96 comments. May improve with MS API integration |
| #725 | Meeting notification as separate window with join button | **Medium** | Needs testing | May already work with `enableIncomingCallToast` |

### Issues Waiting for User Action (Not Immediate)

- #1743 - Cannot share my screen (individual user issue)
- #1754 - Can't join meetings in the lobby (waiting for user)
- #1813 - Device identity not passed through (waiting for user, may not be real issue)
- #1795 - Notifications missing in v2.3.0 tray icon (should be fixed in latest version)
- #1816 - Teams completely stopped working (waiting for user response)
- #1812 - Notification sound wrong/not played (waiting for user action)

### Issues in Progress by Others

- #1791 - Make Teams status available to home automation (another developer working on it)
- #1796 - Attach file from command line (determined to be impossible)

## Next Steps / Action Items

### Immediate Tasks

1. **Add Screen Sharing Logging** (#1800)
   - Add logging to screen sharing functionality to diagnose echo issue
   - Focus on new screen sharing features that might cause audio feedback

2. **Research MS API Integration** (#1234)
   - Investigate Microsoft API options for Teams notifications
   - Could potentially fix both notification issues and authentication problems

3. **Add Authentication Logging** (#1357)
   - Better diagnostics for persistent login issues
   - May be resolved if MS API integration is implemented

### Testing Tasks (When Possible)

4. **Test enableIncomingCallToast** (#725)
   - Requires someone to make a test call
   - Verify if meeting notification window functionality already works
   - **Blocker**: Need someone available to make test calls

### Strategic Decision Required

5. **Choose Next Major Initiative**
   - **Option A**: MS API Integration (#1234) - Fix notifications and potentially authentication
   - **Option B**: Architecture Modernization (#1799) - Foundation for Project 2.0
   - Consider impact vs effort for both approaches

## Recommendations

### Short Term (This Week)
- Add logging to screen sharing and authentication systems
- Research MS API integration feasibility

### Medium Term (Next Sprint)
- Make strategic decision between API integration vs architecture work
- Begin implementation of chosen approach

### Long Term
- Complete Project 2.0 transition
- Address remaining UX enhancement requests

## Notes
- Teams v2 migration is the biggest blocker for Project 2.0 success
- Screen sharing issues affect core functionality and user experience  
- Authentication stability impacts user retention
- Architecture modernization vs API integration decision will shape project direction

---
*Investigation conducted: September 2, 2025*
*Next review: After completing immediate logging tasks*