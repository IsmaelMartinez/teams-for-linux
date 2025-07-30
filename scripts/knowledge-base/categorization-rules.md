# Issue Categorization Rules

This file contains simple, human-readable rules for categorizing GitHub issues into knowledge base topics. These rules are designed to be easily understood and maintained by both humans and AI assistants.

## Categories

### Installation and Setup Issues
**Keywords**: install, installation, setup, configure, config, dependencies, package
**Labels**: installation, setup, packaging
**File patterns**: installation-problems.md

Typical issues:
- Package installation failures
- Dependency conflicts  
- Configuration problems
- First-time setup issues

### Audio and Sound Issues
**Keywords**: audio, sound, microphone, mic, speaker, volume, mute, headset
**Labels**: audio, sound
**File patterns**: audio-issues.md

Typical issues:
- Microphone not working
- Audio device selection
- Sound quality problems
- Headset compatibility

### Video and Display Issues
**Keywords**: video, camera, webcam, display, screen, sharing, resolution, gpu
**Labels**: video, display, gpu
**File patterns**: video-display-issues.md

Typical issues:
- Camera not detected
- Screen sharing problems
- Display quality issues
- GPU compatibility

### Notifications and System Integration
**Keywords**: notification, notify, tray, desktop, system, integration, badge
**Labels**: notifications, system-integration
**File patterns**: notifications-system.md

Typical issues:
- Missing notifications
- System tray problems
- Desktop integration
- Badge/counter issues

### Authentication and Login Issues
**Keywords**: login, auth, authentication, oauth, credentials, signin, sso
**Labels**: authentication, login
**File patterns**: authentication-issues.md

Typical issues:
- Login failures
- OAuth problems
- SSO integration
- Credential management

### Performance and Memory Issues
**Keywords**: slow, performance, memory, cpu, freeze, crash, lag
**Labels**: performance, memory, crash
**File patterns**: performance-issues.md

Typical issues:
- Application crashes
- High memory usage
- Slow performance
- Freezing problems

### Packaging and Distribution
**Keywords**: snap, appimage, deb, rpm, flatpak, package, distribution
**Labels**: packaging, snap, appimage, deb
**File patterns**: packaging-distribution.md

Typical issues:
- Package format problems
- Distribution-specific issues
- Update mechanisms
- Package manager conflicts

### Feature Requests and Enhancements
**Keywords**: feature, request, enhancement, improvement, suggestion
**Labels**: enhancement, feature-request
**File patterns**: feature-requests.md

Typical issues:
- New feature suggestions
- UI/UX improvements
- Workflow enhancements
- Integration requests

### Configuration and Customization
**Keywords**: config, configuration, custom, theme, css, style, settings
**Labels**: configuration, customization
**File patterns**: configuration-customization.md

Typical issues:
- Custom CSS problems
- Theme issues
- Settings management
- Customization options

### Network and Connectivity
**Keywords**: network, connection, proxy, firewall, offline, connectivity
**Labels**: network, connectivity
**File patterns**: network-connectivity.md

Typical issues:
- Connection problems
- Proxy configuration
- Firewall issues
- Offline functionality

## Classification Logic

### Primary Classification
1. Check issue labels first (most reliable)
2. Scan title for keywords (high weight)
3. Scan body for keywords (medium weight)
4. Check for error messages or stack traces

### Secondary Classification
- Issues can belong to multiple categories
- Use primary category for main classification
- Tag with secondary categories for cross-references

### Special Cases
- **Bug reports**: Check symptoms to determine category
- **Duplicate issues**: Group with original issue category
- **Meta issues**: Usually go to a general "Project Management" category
- **Pull requests**: Generally not included in knowledge base

## Output Format

Each categorized issue should include:
- Original issue number and title
- Category classification
- Key symptoms/problems
- Solution summary (if resolved)
- Link to original GitHub issue
- Related issues (if any)

## Maintenance Notes

- Review and update rules quarterly
- Add new categories as patterns emerge
- Adjust keyword weights based on classification accuracy
- Remove or merge categories that have too few issues
