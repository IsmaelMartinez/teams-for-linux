# DOM Access Restoration Plan

**CRITICAL**: Teams for Linux DOM access restoration for v2.6/2.7

## Research Complete - Implementation Required

### API Spike Results:
- Enterprise users (work accounts): ✅ Teams APIs work
- Individual users (personal accounts): ❌ Teams APIs blocked  
- Authentication benefits: ✅ Reduces re-login issues

### React Breaking Change:
- Current ReactHandler uses deprecated APIs
- Q4 2025: Microsoft Teams React 19 update will break DOM access
- Timeline: Emergency - could break anytime

### Code Changes Required:

1. app/mainAppWindow/browserWindowManager.js:
   - contextIsolation: true → false
   - nodeIntegration: false → true  
   - sandbox: true → false

2. app/browser/preload.js:
   - Remove contextBridge usage
   - Use direct window object instead

### Strategy:
- Phase 1 (v2.6/2.7): DOM access for ALL users
- Phase 2 (v3.0): API integration for ENTERPRISE users

### Next Steps:
1. Make the code changes above
2. Test ReactHandler functionality  
3. Release v2.6/2.7
4. Plan API integration for v3.0
