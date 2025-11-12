# Enhancement Issue: Automated PR Binary Builds for Testing

**Title**: [Feat]: Provide pre-built binaries for Pull Requests to enable testing without building from source

## Describe the feature

Add automated binary artifact uploads to Pull Request builds, allowing users and maintainers to test PR changes by downloading pre-built packages directly from GitHub Actions instead of requiring local builds from source.

## Motivation

**Current Pain Points:**
- Contributors and testers must build from source to test PR changes
- Building requires dev environment setup (Node.js, build tools, disk space)
- Build process takes 5-10 minutes and can fail with environment issues
- Maintainer needs to manually build and distribute test binaries when requested
- Reduces testing participation from non-technical users who could provide valuable feedback

**Problem This Solves:**
- Enables instant testing of PR changes via simple download
- Lowers barrier for community testing and feedback
- Allows maintainer to quickly share test builds with users reporting issues
- Improves PR review process with easier functional testing
- Increases confidence in merges by enabling broader pre-release testing

**Real-World Example:**
When a user reports a bug fix is needed, the maintainer creates a PR. Currently, the user must either:
1. Wait for a full release to test the fix, OR
2. Learn to build from source (often not feasible)

With PR binaries, the maintainer can simply link to the PR and say "Download the artifact to test the fix."

## Alternatives

### Alternative 1: Manual Build Distribution
**Description**: Maintainer manually builds and uploads to file sharing service when requested
**Cons**: Time-consuming, not scalable, inconsistent, no automation

### Alternative 2: External CI with Public Downloads (CircleCI, AppVeyor, etc.)
**Description**: Use third-party CI service with public artifact hosting
**Cons**: Additional service to maintain, potential costs, less integrated with GitHub workflow

### Alternative 3: Pre-Release Channel on Package Managers
**Description**: Publish pre-release versions to Snap/Flatpak/AUR beta channels
**Cons**: Pollutes release channels, harder to track specific PRs, may confuse users

### Alternative 4: Cloud Storage (Cloudflare R2, AWS S3)
**Description**: Upload artifacts to cloud storage with direct download links
**Cons**: Monthly costs ($1-5), additional infrastructure, security/access management complexity

### Recommended: GitHub Actions Artifacts (Native)
**Description**: Use existing GitHub Actions with `actions/upload-artifact` for PR builds
**Pros**:
- Free within GitHub limits (90-day retention)
- Native integration with existing workflows
- Secure (requires GitHub authentication)
- No additional services needed
- Already building on every PR push (just need to save artifacts)

**Cons**:
- Requires GitHub account to download
- Separate downloads per platform (not unified)
- Less discoverable than direct links

## Additional context

### Implementation Approach

**Minimal Implementation** (Quick Win):
```yaml
# Add to existing build.yml jobs for PR branches
- name: Upload PR artifacts
  if: github.event_name == 'pull_request'
  uses: actions/upload-artifact@v4
  with:
    name: teams-for-linux-pr${{ github.event.pull_request.number }}-linux-x64
    path: release/*.{deb,rpm,tar.gz,AppImage}
    retention-days: 30
```

**Enhanced Implementation** (Better UX):
- Add bot comment to PR with download links
- Include checksums in comment
- Support all platforms (Linux x64/ARM64/ARM, macOS, Windows)
- Auto-update comment when new commits pushed

### Existing Infrastructure
- ✅ Build jobs already run on every PR push
- ✅ Produces Linux (deb/rpm/AppImage/tar.gz), macOS (DMG), Windows (EXE)
- ✅ Separate jobs for x64, ARM64, ARMv7l architectures
- ✅ Currently only publishes to releases on main branch
- 🔧 Just needs artifact upload step added for non-main branches

### Platforms to Support
1. **Linux x64** (deb, rpm, tar.gz, AppImage) - Most common
2. **Linux ARM64** (deb, rpm, tar.gz, AppImage) - Raspberry Pi 4/5, ARM servers
3. **Linux ARMv7l** (deb, rpm, tar.gz, AppImage) - Older Raspberry Pi
4. **macOS x64** (DMG) - Intel Macs
5. **Windows x64** (EXE) - Windows PCs

### Security Considerations
- Fork PRs run with `GITHUB_TOKEN` read-only (safe)
- Artifacts require GitHub authentication to download (prevents abuse)
- No secrets exposed to PR builds
- Same security model as current PR builds (just adding upload step)

### Documentation Needs
- Update CONTRIBUTING.md with "Testing PRs" section
- Add instructions: PR → Actions tab → Latest run → Artifacts section
- Include note about GitHub authentication requirement

### Similar Projects Using This Pattern
- VS Code (microsoft/vscode)
- Electron Builder (electron-userland/electron-builder)
- Fork (ForkIssues/Fork)
- Many Electron apps use this pattern successfully

### Storage Considerations
- Artifacts compressed: ~100-200MB per platform per PR push
- 30-day retention: ~10GB max for active PRs (well within GitHub free tier)
- Can adjust retention-days if needed

### Related Issues
- Would complement #1877 (global keyboard shortcut) - easier testing
- Would have helped #1921, #1924 (notification issues) - user testing before release
- Benefits any PR requiring user validation of functionality

---

### Proposed Implementation Timeline
1. **Phase 1** (1-2 hours): Add artifact uploads to build.yml for Linux x64 (most common)
2. **Phase 2** (1 hour): Extend to all platforms (ARM, macOS, Windows)
3. **Phase 3** (2-3 hours, optional): Add PR comment bot with download links
4. **Phase 4** (30 min): Document in CONTRIBUTING.md

**Total effort**: 2-3 hours for basic implementation, 5-6 hours for full featured version
