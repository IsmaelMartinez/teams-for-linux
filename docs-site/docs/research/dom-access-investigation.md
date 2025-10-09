# DOM Access Investigation & Future Strategy

This document consolidates the research and findings from the DOM access restoration efforts in v2.5.2.

## Overview

Teams for Linux requires DOM access to Microsoft Teams' React components for features like:
- User status tracking
- Custom background integration  
- System idle state management
- Authentication flow enhancements

## Critical React Breaking Changes Investigation

**Status**: 🚨 CRITICAL - IMMEDIATE ACTION REQUIRED  
**Date**: August 30, 2025

### Key Findings

**CRITICAL DISCOVERY**: The current ReactHandler implementation uses deprecated React APIs that were removed in React 18+ and will completely break when Microsoft Teams updates to React 19 (expected Q4 2025).

#### Current System
- **Electron Version**: 37.3.1
- **Chromium**: 128.0.6613.186
- **ReactHandler Location**: `app/browser/tools/reactHandler.js`

#### Vulnerable Code Patterns
The current implementation relies on deprecated internal React APIs:
- `_reactRootContainer` - Deprecated in React 18
- `_internalRoot` - Internal API subject to removal
- Direct DOM tree traversal of React internals

#### Risk Assessment
- **Probability**: HIGH - Microsoft Teams will eventually update to React 19
- **Timeline**: Q4 2025 (React 19 release target)
- **Impact**: CRITICAL - Complete feature breakdown
- **User Impact**: Loss of core functionality

### Solution Implemented (v2.5.2)

**Phase 1: DOM Access Restoration** ✅ COMPLETED
- Disabled `contextIsolation` and `sandbox` security features
- Implemented security compensating controls:
  - Content Security Policy (CSP) headers
  - IPC channel validation and allowlisting
  - Teams domain validation
  - Payload sanitization
- Added React version detection for monitoring

## API Feasibility Investigation

**Date**: August 30, 2025  
**Duration**: ~45 minutes  
**Outcome**: ✅ SUCCESSFUL for enterprise users

### Executive Summary

Microsoft Graph API approach is viable for **enterprise users** with work/school accounts, but has limitations for individual users with personal accounts. This aligns well with our primary user base.

### Test Results by Account Type

#### Enterprise Account Testing
**Account**: Work/school account  
**Result**: ✅ FULL SUCCESS

**Capabilities Confirmed**:
- Full Microsoft Graph API access
- User profile and presence data
- Calendar integration capabilities
- Authentication token management
- Reduced re-login frequency

**Setup Process**:
1. Azure app registration (straightforward)
2. API permissions configuration
3. Authentication flow integration

#### Personal Account Testing
**Account**: Personal Microsoft account  
**Result**: ⚠️ LIMITED SUCCESS

**Limitations**:
- Azure app registration requires M365 Developer Program
- Additional setup complexity
- Reduced API scope for consumer accounts
- May not justify implementation effort

### Key Insights

1. **Target Audience Alignment**: Most Teams for Linux users are enterprise users
2. **Enhanced Features**: API provides capabilities beyond DOM access
3. **Authentication Benefits**: Significant reduction in re-login issues
4. **Future Resilience**: Less dependence on Teams UI changes

## Future Strategy: Hybrid API + DOM Approach

### Phase 2 Implementation Plan

Build API integration **ON TOP** of current DOM implementation for enhanced functionality:

#### Architecture
- **API-first**: Try API calls first when credentials available
- **DOM fallback**: Fall back to existing DOM methods when API unavailable  
- **User choice**: Optional API setup, works without configuration
- **Gradual migration**: Replace DOM methods with APIs incrementally

#### Benefits
- **Enhanced features**: API provides capabilities beyond DOM access
- **Better authentication**: Reduced re-login issues for enterprise users
- **Future resilience**: Less dependence on Teams UI changes
- **No functionality loss**: DOM fallback ensures all current features work

#### Implementation Priorities
1. **User presence/status management** - High impact, stable API
2. **Authentication flow optimization** - Addresses major user pain point
3. **Calendar integration** - New capability not possible with DOM
4. **Profile and org data** - Enhanced user experience

## Security Considerations

### Current Approach (v2.5.2)
While `contextIsolation` and `sandbox` are disabled for DOM access, comprehensive compensating controls are implemented:

#### Technical Controls
- **Content Security Policy**: Prevents malicious script injection
- **IPC Validation**: Channel allowlisting with payload sanitization
- **Domain Validation**: Restricts DOM access to legitimate Teams domains
- **Input Sanitization**: Prevents prototype pollution attacks

#### Recommended User-Level Security
Instead of relying solely on Electron security features, users should adopt **system-level sandboxing**:

**Available Options**:
- **Flatpak**: Built-in isolation, available via Flathub
- **Snap packages**: Application confinement with auto-updates
- **AppArmor/SELinux**: Most Linux distros include these by default
- **Manual sandboxing**: `firejail` or `bubblewrap` for custom setups

### Why System-Level Sandboxing > Application-Level
1. **Preserves functionality**: DOM access remains intact
2. **Better security**: OS-level controls more robust than Electron sandbox
3. **User choice**: Flexible security levels based on needs
4. **Future-proof**: Works regardless of Teams/React changes

## Implementation Status

### Phase 1: DOM Access Restoration ✅ COMPLETED (v2.5.2)
- [x] Security features disabled (`contextIsolation: false`, `sandbox: false`)
- [x] CSP compensating controls implemented
- [x] IPC validation system created
- [x] React version detection added
- [x] ReactHandler functionality restored
- [x] System-level security recommendations documented

### Phase 2: Hybrid API Integration 🚧 PLANNED
- [ ] Microsoft Graph integration for enterprise users
- [ ] API-first with DOM fallback architecture
- [ ] Enhanced authentication flow
- [ ] Calendar and presence API integration
- [ ] Gradual migration of DOM-dependent features

## Monitoring & Maintenance

### React Version Monitoring
The application now includes automatic React version detection to monitor for breaking changes:

```javascript
// Implemented in app/browser/tools/reactHandler.js
_detectAndLogReactVersion() {
  // Multiple detection methods for reliability
  // Logs version information for monitoring
}
```

### Future Considerations
1. **Regular monitoring** of Teams React version updates
2. **API migration timeline** based on React update schedules  
3. **User communication** about security recommendations
4. **Gradual feature enhancement** through hybrid API approach

## References

- DOM-ACCESS-RESTORATION-PLAN.md (historical planning document)
- [Security IPC Validator](../../../app/security/ipcValidator.js)  
- [ReactHandler Implementation](../../../app/browser/tools/reactHandler.js)
- [Browser Window Security Config](../../../app/mainAppWindow/browserWindowManager.js)