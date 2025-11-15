# GitHub Actions Workflows

This directory contains automated workflows for the Teams for Linux project.

## Workflows Overview

### build.yml - Build & Release

**Trigger**: On every push to any branch

**Purpose**: Builds the application for all supported platforms and creates release artifacts.

**Jobs**:
- `e2e_tests`: Runs Playwright end-to-end tests on Linux
- `linux_x64`: Builds for Linux x64 (deb, rpm, tar.gz, AppImage)
- `linux_arm64`: Builds for Linux ARM64 (deb, rpm, tar.gz, AppImage)
- `linux_arm`: Builds for Linux ARMv7l (deb, rpm, tar.gz, AppImage)
- `dmg`: Builds for macOS x64 (dmg)
- `exe`: Builds for Windows x64 (exe)

**Behavior**:
- **Main branch**: Publishes releases automatically
- **Other branches/PRs**: Creates artifacts for testing (retained for 30 days)

**Artifact Compression**:
- Set to `compression-level: 0` (no additional compression)
- This is intentional because the artifacts themselves are already compressed formats:
  - `.deb`, `.rpm` - already use internal compression
  - `.tar.gz` - gzipped archives
  - `.AppImage` - compressed filesystem
  - `.dmg` - compressed disk images
  - `.exe` - NSIS installers with compression
- Adding additional zip compression would be redundant and could actually increase total size due to double compression overhead

### pr-artifacts-comment.yml - PR Artifacts Comment Bot

**Trigger**: When the "Build & Release" workflow completes

**Purpose**: Automatically posts or updates a comment on pull requests with direct links to build artifacts.

**How It Works**:
1. Waits for the Build & Release workflow to complete
2. Identifies the associated PR from the branch name
3. Lists all build artifacts (excluding test results)
4. Creates or updates a comment with:
   - Build status (✅ success, ❌ failure, ⚠️ other)
   - Direct download links organized by platform
   - File sizes for each artifact
   - Link to the workflow run
   - Last update timestamp

**Benefits**:
- Makes it easy for reviewers to test PR changes
- No need to navigate through the Actions UI
- Always shows the latest artifacts
- Provides quick feedback on build status

**Comment Format**:
```markdown
## 📦 PR Build Artifacts

✅ **Build successful!** Download the latest artifacts below:

### Linux x64
- 📥 [teams-for-linux-linux-x64](link) _(XX.XX MB)_

### macOS
- 📥 [teams-for-linux-macos-x64](link) _(XX.XX MB)_

### Windows
- 📥 [teams-for-linux-windows-x64](link) _(XX.XX MB)_

---
🔗 [View workflow run](link)
⏱️ Updated: [timestamp]
```

**Permissions Required**:
- `contents: read` - Read repository contents
- `pull-requests: write` - Create/update PR comments
- `actions: read` - List workflow artifacts

### codeql-analysis.yml - Security Analysis

**Trigger**: On push to main, pull requests, and scheduled weekly

**Purpose**: Performs automated security and code quality analysis using GitHub CodeQL.

### docs.yml - Documentation Deployment

**Trigger**: On push to main branch (changes in `docs-site/` directory)

**Purpose**: Builds and deploys the Docusaurus documentation site to GitHub Pages.

### snap.yml - Snap Package

**Trigger**: On push to main branch

**Purpose**: Builds and publishes the Snap package to the Snap Store.

### stale.yml - Stale Issues Management

**Trigger**: Scheduled daily

**Purpose**: Manages stale issues and pull requests by marking them and eventually closing them if inactive.

## Development Notes

### Testing Workflows Locally

You can use [act](https://github.com/nektos/act) to test workflows locally:

```bash
# Install act
# See: https://github.com/nektos/act#installation

# List available workflows
act -l

# Run a specific job
act -j linux_x64

# Note: Some workflows require GitHub tokens and may not work fully locally
```

### Workflow Best Practices

1. **Always pin action versions** using commit SHA for security
2. **Use minimal permissions** required for each job
3. **Separate build and release** logic for clarity
4. **Cache dependencies** when appropriate to speed up builds
5. **Use artifacts** for sharing data between jobs
6. **Set retention policies** to manage storage costs

### Adding New Workflows

When adding new workflows:

1. Create the `.yml` file in `.github/workflows/`
2. Test thoroughly on a feature branch first
3. Document the workflow in this README
4. Update related documentation (e.g., contributing.md)
5. Ensure proper permissions are set
6. Pin all action versions using commit SHAs

## Troubleshooting

### Artifacts Not Appearing in PR Comment

1. Check that the Build & Release workflow completed successfully
2. Verify the PR is open (closed PRs won't receive comments)
3. Check the PR Artifacts Comment workflow logs for errors
4. Ensure the bot has proper permissions to comment on PRs

### Build Failures

1. Check the workflow run logs in the Actions tab
2. Common issues:
   - Dependency installation failures (network issues)
   - Linting errors (run `npm run lint` locally)
   - E2E test failures (run `npm run test:e2e` locally)
   - Platform-specific build errors

### Slow Build Times

- Builds run in parallel across multiple platforms
- Total time depends on GitHub Actions runner availability
- Typical build time: 10-20 minutes for all platforms

## Security Considerations

- All workflows use pinned action versions (commit SHAs) for security
- Minimal permissions are granted to each workflow
- Secrets are never exposed in logs
- Artifacts from PRs are publicly downloadable (by authenticated users)
- Only maintainers can trigger releases to main branch

## Related Documentation

- [Contributing Guide](../../docs-site/docs/development/contributing.md)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
