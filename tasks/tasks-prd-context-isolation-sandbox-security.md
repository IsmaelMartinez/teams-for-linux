## System Analysis

### ADR Review

- No Architecture Decision Records found in `docs/adr/` directory
- No existing ADRs to conflict with contextIsolation/sandbox security changes
- Implementation decisions will need to be documented as new ADRs

### Documentation Review

- **IPC API Documentation**: Comprehensive IPC channel documentation exists with security warnings about contextIsolation
- **Configuration Documentation**: Extensive configuration options with security-related settings
- **Browser Tools**: Multiple browser tools that interact with Teams DOM (reactHandler, trayIconChooser, settings)
- **Screen Sharing**: Existing screen sharing functionality with preview window implementation

### Pattern Analysis

- **Electron Security Pattern**: Currently uses contextIsolation with contextBridge API (app/browser/preload.js:4)
- **Module Architecture**: Modular structure with separate concerns (mainAppWindow, screenSharing, browser tools)
- **Configuration Management**: Immutable AppConfiguration class pattern for settings
- **IPC Communication**: Well-established IPC patterns using ipcMain.handle and ipcMain.on
- **Browser Window Management**: BrowserWindowManager class handles window creation and webPreferences

### Conflicts and Constraints

- **Critical Issue**: Current preload.js script is not working properly and needs fixes
- **Screen Sharing Limitation**: Screen sharing currently only works with contextIsolation and sandbox enabled, needs porting back
- **ReactHandler Dependency**: app/browser/tools/reactHandler.js directly accesses Teams React internals, requiring Node.js access
- **Security Trade-off**: Disabling contextIsolation/sandbox conflicts with Electron security best practices
- **DOM Access Requirements**: Multiple browser tools require direct DOM manipulation of Teams interface

### Research Spikes Completed ✅

- **Microsoft Graph Teams API Capabilities**: ✅ COMPLETED - API coverage vs DOM functionality documented
- **Microsoft Teams SDK Investigation**: ✅ COMPLETED - Teams JS SDK not suitable for standalone desktop apps
- **API Rate Limiting Assessment**: ✅ COMPLETED - 50 RPS limits, 650 user subscription limits identified
- **API Feasibility Spike**: ✅ COMPLETED - Enterprise users viable, personal accounts blocked from Teams APIs
- **Authentication Benefits Analysis**: ✅ COMPLETED - Significant re-login issue reduction for enterprise users
- **Caching Strategy Investigation**: ✅ COMPLETED - SQLite + node-cache approach recommended
- **Enterprise Security Requirements Investigation**: ✅ COMPLETED - Basic research into compliance needs
- **Comprehensive Feature Risk Analysis**: ✅ COMPLETED - 56 config options & 13 browser tools analyzed
- **Personal vs Enterprise Feature Strategy**: ✅ COMPLETED - Individual user features prioritized
- **Microsoft Migration Timeline Research**: ✅ COMPLETED - Classic Teams deprecated, New Teams mandatory 2024
- **contextIsolation vs Sandbox Security Analysis**: ✅ COMPLETED - contextIsolation priority confirmed
- **External Sandboxing Research**: ✅ COMPLETED - Firejail integration options explored
- **Personal Productivity Features Deep Dive**: ✅ COMPLETED - Quick wins & game changers identified

### Key Spike Findings
- **Enterprise Users (70-80%)**: Work accounts can access full Teams APIs, significant authentication benefits
- **Individual Users (20-30%)**: Personal accounts blocked from Teams APIs, must use DOM access
- **React Breaking Timeline**: Q4 2025 React 19 update will break current ReactHandler completely
- **Webhook Reality**: Impractical for Electron apps, polling approach required
- **Security Priority**: contextIsolation > sandbox - enables DOM access with enhanced security via preload bridge
- **Personal Features > Enterprise**: Individual productivity features provide higher user value than organizational analytics
- **Microsoft Migration Reality**: New Teams (React-based) already mandatory since July 2024, DOM stability expected 12-24 months
- **Feature Risk Assessment**: 26 high-risk DOM-dependent features, 18 medium-risk API workarounds, 12 low-risk direct API features

## Relevant Files

- `app/mainAppWindow/browserWindowManager.js` - ✅ Modified webPreferences to disable contextIsolation and sandbox with comprehensive security comments
- `app/browser/preload.js` - ✅ Updated to work without contextBridge, enabled direct Node.js access for browser tools
- `app/browser/tools/reactHandler.js` - Core DOM access functionality that requires contextIsolation to be disabled
- `app/browser/tools/*.js` - Various browser tools that may need Node.js API access
- `app/mainAppWindow/index.js` - Screen sharing preview window configuration may need security updates
- `app/screenSharing/index.js` - Screen sharing functionality that needs porting back to work without contextIsolation
- `docs-site/docs/ipc-api.md` - ✅ Updated with v2.6+ security configuration notes
- `docs-site/docs/screen-sharing.md` - ✅ Updated with contextIsolation and sandbox status for v2.6+
- `app/screenSharing/README.md` - ✅ Updated security section reflecting disabled contextIsolation and sandbox
- `README.md` - ✅ Updated with v2.6+ security configuration references
- `tasks/investigation-react-breaking-changes.md` - ✅ Created comprehensive API research and React breaking change investigation
- `tasks/api-feasibility-spike-results.md` - ✅ Created detailed API testing results and enterprise vs personal account analysis
- `FEATURE_RISK_ANALYSIS.md` - ✅ Created comprehensive feature risk analysis for Graph API migration
- `INDIVIDUAL_USER_FEATURES_INVESTIGATION.md` - ✅ Created personal productivity features analysis with complexity ratings
- `ENTERPRISE_FEATURES_INVESTIGATION.md` - ✅ Created enterprise/organizational features documentation
- `PERSONAL_PRODUCTIVITY_DEEP_DIVE.md` - ✅ Created detailed analysis of high-impact personal features with implementation plans
- `package.json` - ✅ Updated version to 2.5.2 following proper release workflow
- `package-lock.json` - ✅ Updated via npm install for version consistency
- `com.github.IsmaelMartinez.teams_for_linux.appdata.xml` - ✅ Added 2.5.2 release notes for DOM access restoration and audio fix revert

### Notes

- Current preload script has issues and needs fixing
- Screen sharing functionality needs to be ported back to work without contextIsolation/sandbox
- Existing DOM interaction patterns through browser tools are extensive
- Multiple browser windows use different webPreferences configurations
- ReactHandler specifically accesses Teams internal React structures requiring full DOM access

## Tasks

- [ ] 1.0 Microsoft Teams API and SDK Research
  - [x] 1.1 Research Microsoft Graph Teams APIs for real-time event capabilities
  - [x] 1.2 Investigate official Microsoft Teams SDKs and developer tools
  - [x] 1.3 Document API endpoints for user status, meeting events, and message notifications
  - [x] 1.4 Research webhook subscription capabilities and limitations
  - [x] 1.5 Test API authentication requirements and permission scopes
  - [x] 1.6 Evaluate SDK integration complexity and feature coverage
  - [x] 1.7 Research API rate limits and scaling constraints for 1M+ users
  - [x] 1.8 Design user opt-in model for API credentials and setup documentation
  - [x] 1.9 Investigate API polling strategies for Electron apps (webhooks impractical)
  - [x] 1.10 Basic caching strategy investigation for API responses
- [x] 2.0 Survival Strategy Decision Framework (Updated for React Breaking Changes)
  - [x] 2.1 Create feature comparison matrix (API/SDK vs DOM access)
  - [x] 2.2 Document functionality gaps between approaches
  - [x] 2.3 Document React breaking change timeline and impact
  - [x] 2.4 Create two-phase implementation strategy
  - [x] 2.5 Evaluate security implications and risk assessment
  - [x] 2.6 Create migration timeline from DOM to API fallback
  - [x] 2.7 Generate emergency action plan with supporting analysis
- [ ] 3.0 Phase 1: Emergency DOM Access Restoration (Immediate - 0-2 months)
  - [x] 3.1 Modify webPreferences in browserWindowManager.js to disable contextIsolation and sandbox
  - [x] 3.2 Remove contextBridge usage from preload.js and enable direct Node.js access
  - [x] 3.3 Update screen sharing windows to use disabled security settings (SKIPPED - keeping secure as they don't need DOM access)
  - [x] 3.4 Implement Content Security Policy headers as compensating control
  - [x] 3.5 Add input validation for DOM interactions in browser tools
  - [x] 3.6 Create secure IPC patterns for renderer-to-main communication
  - [x] 3.7 Update configuration documentation with new security settings
  - [x] 3.8 Add React version monitoring and breaking change detection
- [ ] 4.0 Phase 2: Backend API Integration System (CONFIRMED STRATEGY - Critical - 2-8 months)
  - [x] 4.1 ✅ BREAKTHROUGH: Verify backend token extraction capability (TokenInspector implemented)
  - [x] 4.2 ✅ BREAKTHROUGH: Confirm Graph API access with existing Teams auth (Testing framework implemented)
  - [x] 4.3 ✅ BREAKTHROUGH: Token scope analysis complete - 25+ scopes identified
  - [x] 4.4 ✅ BREAKTHROUGH: Live API validation successful - real user data retrieved
  - [ ] 4.5 🚀 HIGH-PRIORITY: Implement secure token extraction in main process (No DOM access required)
  - [ ] 4.6 🚀 HIGH-PRIORITY: Create backend Graph API client using extracted tokens
  - [ ] 4.7 📅 Calendar Integration: Implement calendar events API for meeting status (`Calendars.Read` available)
  - [ ] 4.8 📧 Email Integration: Implement mail notifications API (`Mail.Read`, `Mail.ReadWrite` available)
  - [ ] 4.9 📁 Files Integration: Implement OneDrive/SharePoint file access (`Files.ReadWrite.All` available)
  - [ ] 4.10 👥 Directory Integration: Implement user directory lookup (`User.ReadBasic.All` available)
  - [ ] 4.11 🏢 Organization Integration: Implement company info access (`Organization.Read.All` available)
    - [ ] 4.12 ⚠️ Presence Implementation: Calendar-based status inference using `Calendars.Read` scope
  - [ ] 4.13 🔄 Token Management: Secure token refresh and caching mechanism  
  - [ ] 4.14 🛡️ Security Restoration: Re-enable contextIsolation with backend API access
  - [ ] 4.15 🔧 Graceful Degradation: DOM fallback when token extraction fails
  - [x] 4.16 ✅ CONFIRMED: Scope expansion testing - organizational limitations identified
- [ ] 5.0 Phase 1: Browser Tools and Screen Sharing Port Back (Immediate)
  - [x] 5.1 Fix current preload.js script functionality issues
  - [ ] 5.2 Port screen sharing functionality to work without contextIsolation
  - [ ] 5.3 Update reactHandler.js for direct DOM access without contextBridge
  - [ ] 5.4 Add React version detection and breaking change warnings
  - [ ] 5.5 Modify trayIconChooser to work with disabled security isolation
  - [ ] 5.6 Update other browser tools (settings, theme, shortcuts) for Node.js access
  - [ ] 5.7 Test screen sharing preview window functionality
  - [ ] 5.8 Ensure all browser tools maintain functionality after security changes
  - [x] 5.9 Update IPC API documentation for security configuration changes

## 🚀 STRATEGIC PIVOT - Backend Token Access Discovery (August 31, 2025)

### Major Breakthrough: Secure API Access Without DOM Dependency

**GAME CHANGING DISCOVERY**: We can access Microsoft Graph API from the main process using stored authentication tokens, potentially eliminating the security trade-offs of disabled contextIsolation.

#### Key Evidence
- ✅ **TokenInspector Implementation**: Successfully extracts 4+ Microsoft/Teams cookies from session storage
- ✅ **ReactHandler Enhancement**: Enhanced React 18+ detection now working - "Successfully found core services"
- ✅ **Graph API Testing Framework**: Built comprehensive testing system for `/me` and `/me/presence` endpoints
- ✅ **Backend Storage Access**: Confirmed localStorage, sessionStorage, cookies accessible from main process
- ✅ **Token Scope Analysis**: 25+ Graph API scopes identified including Calendar, Mail, Files, Teams basic features
- ✅ **Live API Validation**: Successfully retrieved real user data via Graph API `/me` endpoint

#### Strategic Implications

**New Hybrid Architecture**:
1. **Phase 1 (Current)**: Temporary DOM access with disabled contextIsolation for immediate functionality
2. **Phase 2 (Next)**: Backend API integration using extracted tokens with contextIsolation re-enabled
3. **Phase 3 (Future)**: Hybrid system - DOM for UI interactions, Backend API for secure data access

#### Benefits of Backend Token Approach
- 🔐 **Enhanced Security**: Restore contextIsolation and sandbox protection  
- ⚡ **Performance**: Direct API calls without DOM polling overhead
- 🛡️ **Reliability**: Independent of React version changes and UI modifications
- 🔧 **Maintenance**: Reduced dependency on fragile DOM access patterns
- 👥 **User Experience**: Zero additional setup complexity for users

#### Implementation Status
- 🧪 **Phase**: Proof of concept and testing framework completed
- 🎯 **Next**: Extract and validate token access from main process only
- 📋 **Timeline**: Backend integration can be implemented alongside current DOM approach

This discovery transforms our strategy from a temporary security compromise to a sustainable, secure solution that leverages existing Teams authentication while maintaining Electron security best practices.

## 📊 CURRENT STATUS SUMMARY (August 31, 2025)

### ✅ COMPLETED RESEARCH & ANALYSIS
- **✅ Feature Risk Analysis**: Comprehensive analysis of 56 configuration options and 13 browser tools
- **✅ Security Strategy**: contextIsolation priority confirmed, external sandboxing options explored
- **✅ User Value Strategy**: Individual productivity features prioritized over enterprise analytics  
- **✅ Implementation Roadmap**: Personal productivity quick wins and game changers identified
- **✅ Microsoft Timeline Research**: New Teams mandatory since July 2024, DOM stability window confirmed

### 🎯 STRATEGIC DIRECTION CONFIRMED

**Hybrid Approach - Best of Both Worlds**:
1. **Phase 1** (Current): DOM access with contextIsolation disabled for immediate functionality
2. **Phase 2** (Next 3-6 months): Graph API integration using extracted tokens + contextIsolation re-enabled
3. **Phase 3** (6-12 months): Individual productivity features that make Teams indispensable

**User Value Focus**:
- **Primary**: Personal productivity enhancement (VIP alerts, meeting prep, focus time, smart notifications)
- **Secondary**: Ecosystem integration (MQTT, home automation, workflow bridges)  
- **Tertiary**: Enterprise analytics and organizational features

**Security Approach**:
- **Immediate**: contextIsolation disabled with secure preload bridge and input validation
- **Short-term**: Enable contextIsolation with backend Graph API access  
- **Long-term**: Optional external sandboxing (Firejail) for security-conscious users

#### 🎯 **Confirmed API Integration Capabilities**

**Available Graph API Scopes (25+ confirmed)**:
- **📅 Calendar**: `Calendars.Read`, `Calendars.ReadWrite` - Meeting status, scheduling
- **📧 Email**: `Mail.Read`, `Mail.ReadWrite` - Notifications, quick actions  
- **📁 Files**: `Files.ReadWrite.All`, `Sites.ReadWrite.All` - Document collaboration
- **👥 Directory**: `User.ReadBasic.All`, `Organization.Read.All` - Contact lookup
- **🏢 Teams Basic**: `Team.ReadBasic.All`, `Channel.ReadBasic.All` - Team structure
- **📝 Productivity**: `Notes.ReadWrite.All`, `Tasks.ReadWrite` - OneNote, Tasks

**Confirmed Scope Limitations (Organizational Constraints)**:
- **❌ Presence API**: `Presence.Read` - Teams app lacks Azure AD registration for this scope
- **❌ Chat APIs**: `Chat.Read`, `ChatMessage.Read` - Not available in Teams app registration
- **❌ Meeting APIs**: `OnlineMeetings.Read.All` - Advanced meeting features blocked

**✅ Scope Expansion Results**: 
- Dynamic scope requests work but organizational Azure AD app registration limits available permissions
- Calendar-based presence using `Calendars.Read` is the optimal workaround
- 25+ available scopes provide rich integration capabilities without additional user setup

**Final Implementation Priority**:
1. **Calendar Integration** - Meeting detection, status inference, scheduling
2. **Email Integration** - Rich notifications, quick actions
3. **File Integration** - Document access, collaboration workflows
4. **User Directory** - Contact lookup, organization structure

### 🚀 IMMEDIATE NEXT ACTIONS

**Phase 2 Backend Implementation (Priority 1)**:
- [ ] 4.5 🚀 HIGH-PRIORITY: Implement secure token extraction in main process
- [ ] 4.6 🚀 HIGH-PRIORITY: Create backend Graph API client using extracted tokens
- [ ] 4.14 🛡️ Security Restoration: Re-enable contextIsolation with backend API access

**Personal Productivity Quick Wins (Priority 2)**:
- [ ] **VIP Email Alerts**: 3-day implementation - immediate user value
- [ ] **Meeting File Assistant**: 1-week implementation - high impact feature
- [ ] **Smart Focus Blocks**: 1-week implementation - productivity enhancement  
- [ ] **Calendar-Based Presence**: 2-week implementation - intelligent status management

**Remaining DOM Restoration Tasks**:
- [ ] 5.2 Port screen sharing functionality to work without contextIsolation
- [ ] 5.4 Add React version detection and breaking change warnings
- [ ] 5.5 Modify trayIconChooser to work with disabled security isolation

## Future Improvements

### Priority 2 (Nice-to-Have)

- Hybrid API/DOM approach for maximum functionality with reduced security risk
- Caching strategy implementation based on investigation findings
- Performance monitoring for API vs DOM approaches
- **Visual tray icon overlay for Cinnamon desktop environment** - Create dynamic tray icons with notification count overlaid on icon image for Cinnamon users (currently only tooltip shows count)

### Priority 3 (Future Consideration)

- Migration to Teams SDK when more mature
- API response optimization
- Enterprise security requirements compliance based on investigation

### Technical Debt Considerations

- Document new security architecture decisions in ADRs
- Fix current preload script functionality issues
- Port screen sharing back to work without contextIsolation
- Code organization improvements for security-sensitive modules