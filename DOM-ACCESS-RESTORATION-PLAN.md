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
- ✅ **Phase 1 Complete (v2.5.2)**: DOM access restored for ALL users
- 🚧 **Phase 2 Planned**: Hybrid API + DOM system for enhanced functionality

### Phase 2: Hybrid API + DOM Approach
Build API integration **ON TOP** of current DOM implementation:

**Benefits**:
- **Enhanced features**: API provides capabilities beyond DOM access
- **Better authentication**: Reduced re-login issues for enterprise users
- **Future resilience**: Less dependence on Teams UI changes
- **No functionality loss**: DOM fallback ensures all current features work

**Architecture**:
- **API-first**: Try API calls first when credentials available
- **DOM fallback**: Fall back to existing DOM methods when API unavailable
- **User choice**: Optional API setup, works without configuration
- **Gradual migration**: Replace DOM methods with APIs incrementally

### Security Recommendation:
Instead of re-enabling Electron security features (which break functionality), users should adopt **system-level sandboxing**:

**Available Options**:
- **Flatpak**: Built-in isolation, available via Flathub
- **Snap packages**: Application confinement with auto-updates  
- **AppArmor/SELinux**: Most Linux distros include these by default
- **Manual sandboxing**: `firejail` or `bubblewrap` for custom setups

### Why System-Level Sandboxing > Application-Level:
1. **Preserves functionality**: DOM access remains intact
2. **Better security**: OS-level controls more robust than Electron sandbox
3. **User choice**: Flexible security levels based on needs
4. **Future-proof**: Works regardless of Teams/React changes

### Implementation Status:
1. ✅ Code changes completed (v2.5.2)
2. ✅ ReactHandler functionality restored
3. ✅ Released with security compensating controls
4. ✅ System-level security recommendations documented
