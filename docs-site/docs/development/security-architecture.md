# Security Architecture & Considerations

This document outlines the security architecture, design decisions, and compensating controls implemented in Teams for Linux, particularly around the DOM access requirements and security trade-offs made in v2.5.2.

## Security Context

### The DOM Access Requirement

Teams for Linux requires DOM access to Microsoft Teams' React components to provide core functionality:

- **User Status Tracking**: Monitor and sync user presence state
- **Custom Background Integration**: Inject custom background options into Teams interface
- **System Idle Management**: Sync system idle state with Teams presence
- **Authentication Flow Enhancement**: Improve login experience and reduce re-authentication

### Security vs. Functionality Trade-off

The application faces a fundamental security vs. functionality trade-off:

**Option A: Maximum Security**
- Enable Electron `contextIsolation` and `sandbox`
- ❌ Breaks all DOM access functionality
- ❌ Eliminates core application features

**Option B: Balanced Security** (Current Approach)
- Disable `contextIsolation` and `sandbox` for main window
- ✅ Restore all DOM access functionality  
- ✅ Implement comprehensive compensating controls
- ✅ Recommend system-level sandboxing

## Current Security Implementation (v2.5.2)

### Electron Security Configuration

```javascript
// app/mainAppWindow/browserWindowManager.js
webPreferences: {
  contextIsolation: false,  // Required for ReactHandler DOM access
  nodeIntegration: false,   // Secure: preload scripts don't need this
  sandbox: false,           // Required for system API access
}
```

**Key Security Decision**: `nodeIntegration` remains `false` to prevent Node.js access in renderer processes, maintaining a critical security boundary.

### Compensating Security Controls

#### 1. Content Security Policy (CSP) Headers

**Implementation**: `app/mainAppWindow/browserWindowManager.js:59-102`

```javascript
const responseHeaders = {
  'Content-Security-Policy': [
    "default-src 'self' https://teams.microsoft.com https://teams.live.com ...",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://teams.microsoft.com ...",
    "object-src 'none';",
    "base-uri 'self';",
    "frame-ancestors 'none';"
  ]
};
```

**Protection**: Prevents malicious script injection and restricts resource loading to trusted domains.

#### 2. IPC Channel Validation

**Implementation**: `app/security/ipcValidator.js`

**Features**:
- **Channel Allowlisting**: Only legitimate IPC channels are permitted
- **Payload Sanitization**: Removes dangerous properties (`__proto__`, `constructor`, `prototype`)
- **Prototype Pollution Protection**: Guards against object prototype manipulation
- **Request Validation**: Validates all IPC requests before processing

```javascript
function validateIpcChannel(channel, payload = null) {
  if (!allowedChannels.has(channel)) {
    console.warn(`[IPC Security] Blocked unauthorized channel: ${channel}`);
    return false;
  }
  // Payload sanitization logic...
}
```

#### 3. Domain Validation

**Implementation**: `app/browser/tools/reactHandler.js:142-157`

```javascript
_isAllowedTeamsDomain(hostname) {
  const allowedDomains = [
    'teams.microsoft.com',
    'teams.live.com'
  ];
  
  // Prevents subdomain hijacking attacks
  for (const domain of allowedDomains) {
    if (hostname === domain) return true;
    if (hostname.endsWith('.' + domain)) return true;
  }
  return false;
}
```

**Protection**: Restricts DOM access to legitimate Teams domains only, preventing access from malicious sites.

#### 4. Screen Sharing Isolation

**Security Model**: Screen sharing windows maintain full security isolation:
- `contextIsolation: true`
- `sandbox: true` 
- No DOM access requirements
- Separate security context

## Recommended User-Level Security

### System-Level Sandboxing

Instead of relying solely on Electron security features, users should adopt **system-level sandboxing**:

#### Available Options

**Flatpak**
- Built-in application isolation
- Available via Flathub
- Automatic permission management
- Filesystem access restrictions

**Snap Packages**
- Application confinement system
- Auto-updates with security patches
- Interface-based permission system

**AppArmor/SELinux**
- Available by default on most Linux distributions
- Kernel-level security enforcement
- Fine-grained access control policies

**Manual Sandboxing Tools**
- `firejail`: User-space sandboxing
- `bubblewrap`: Container-based isolation
- Custom chroot environments

#### Why System-Level > Application-Level

1. **Preserves Functionality**: DOM access remains intact
2. **Better Security**: OS-level controls more robust than Electron sandbox
3. **User Choice**: Flexible security levels based on individual needs
4. **Future-Proof**: Works regardless of Teams/React changes
5. **Defense in Depth**: Additional security layer independent of application

## Security Monitoring & Maintenance

### React Version Monitoring

**Implementation**: Automatic React version detection in `app/browser/tools/reactHandler.js`

```javascript
_detectAndLogReactVersion() {
  const { version, method } = this._detectReactVersion();
  console.debug(`ReactHandler: React version detected: ${version} (via ${method})`);
}
```

**Purpose**: Monitor Teams React version updates that could break DOM access functionality.

## Future Security Enhancements

### Phase 2: API Integration Security

**Planned Security Improvements**:
- **OAuth 2.0 Integration**: Secure Microsoft Graph authentication
- **Token Management**: Secure credential storage and rotation
- **Permission Scoping**: Minimal required API permissions
- **Rate Limiting**: API abuse prevention

**Timeline**: Planned for implementation next

### Long-term Security Goals

1. **Progressive Hardening**: Gradual restoration of Electron security features as API migration completes
2. **Zero-Trust Architecture**: Assume all external inputs are malicious  
3. **Automated Security Testing**: Integration of security tests in CI/CD
4. **Security Documentation**: Comprehensive security guide for developers

## Risk Assessment

### Current Risk Level: MEDIUM

**Rationale**:
- ✅ Comprehensive compensating controls implemented
- ✅ Node.js access prevented (`nodeIntegration: false`)
- ✅ Domain restrictions enforced
- ✅ IPC validation active
- ⚠️ Electron isolation features disabled
- ⚠️ Dependent on user-level sandboxing adoption

### Risk Mitigation Priorities

1. **High Priority**: System-level sandboxing adoption
2. **Medium Priority**: API migration completion  
3. **Low Priority**: Enhanced monitoring and logging

### Acceptable Risk Justification

The current security posture represents an acceptable risk because:

1. **Compensating Controls**: Multiple security layers implemented
2. **User Choice**: System-level sandboxing available
3. **Community Benefit**: Preserves functionality for thousands of users
4. **Open Source**: Transparent implementation for security review

## Security Contact & Reporting

**Security Issues**: Report via GitHub Security Advisories  
**Security Questions**: GitHub Discussions security category  
**Emergency Contact**: Project maintainer via GitHub
