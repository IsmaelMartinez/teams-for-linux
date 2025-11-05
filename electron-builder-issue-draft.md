# electron-builder Issue Draft

## Title
FPM file path resolution issue prevents using `--deb-upstream-changelog` and `--rpm-changelog` flags

## Description

### Problem
When attempting to use FPM's `--deb-upstream-changelog` or `--rpm-changelog` flags through electron-builder's `deb.fpm` or `rpm.fpm` configuration options, FPM cannot resolve relative file paths, making it impossible to include custom changelog files in packages.

### Configuration Attempted

```json
{
  "build": {
    "deb": {
      "fpm": [
        "--deb-upstream-changelog=debian-changelog"
      ]
    },
    "rpm": {
      "fpm": [
        "--rpm-changelog=debian-changelog"
      ]
    }
  }
}
```

Where `debian-changelog` is a file generated in the project root during the `afterPack` phase.

### Error

```
Error: fpm process failed 1
Exit code: 1
Output:
/var/lib/gems/3.0.0/gems/fpm-1.17.0/lib/fpm/package/deb.rb:621:in `initialize':
No such file or directory @ rb_sysopen - /workspace/debian-changelog (Errno::ENOENT)
```

### Root Cause

FPM resolves file paths relative to its own working directory, not the project root. When electron-builder invokes FPM, the file paths passed via the `fpm` configuration array cannot be resolved because:

1. FPM runs in an isolated context
2. Relative paths are resolved from FPM's working directory
3. electron-builder doesn't provide a way to specify FPM's working directory or resolve paths before passing them to FPM

### Workarounds Attempted

1. **Absolute paths**: Would be environment-specific and break across different build environments (local, CI/CD, Docker)
2. **Using system FPM with `USE_SYSTEM_FPM=true`**: Same issue persists
3. **Different file locations**: Tried various relative paths, none work

### Expected Behavior

One of the following would resolve this:

1. **Path Resolution**: electron-builder should resolve file paths in the `fpm` array relative to the project root before passing them to FPM
2. **Working Directory Control**: Provide a configuration option to set FPM's working directory
3. **File Mapping**: Add a configuration option to map files into FPM's context before execution
4. **Documentation**: If this is intentional/unsupported, document that only simple flags work in `fpm` arrays, not file path arguments

### Environment

- **electron-builder version**: 26.1.0
- **Node version**: 22.x
- **Operating System**: Linux (tested in Docker, macOS, and CI/CD)
- **FPM version**: 1.17.0 (both bundled and system)

### Minimal Reproduction

Repository demonstrating the issue: https://github.com/IsmaelMartinez/teams-for-linux/tree/claude/investigate-deb-changelog-issue-011CUoVFBDhEdMXvxYqfZ92f

Key files:
- `package.json` - Build configuration with fpm flags
- `scripts/generateDebianChangelog.js` - Generates the changelog file
- `scripts/afterpack.js` - Calls changelog generation during build

Steps to reproduce:
1. Clone the repository and checkout the branch
2. Run `npm ci`
3. Run `npm run dist:linux:deb`
4. Observe the file path error

### Related Issues

- FPM upstream: https://github.com/jordansissel/fpm/issues/1575 (changelog path confusion)
- electron-builder: #400 (system vs bundled FPM changelog differences)
- Downstream issue: https://github.com/IsmaelMartinez/teams-for-linux/issues/1691

### Use Case

Many Electron applications want to include detailed changelogs in their deb/rpm packages to satisfy Debian policy and provide users with package-level changelog access via `apt changelog` or `dpkg` commands. Currently, FPM creates a generic "Package created with FPM" changelog, which is not useful for end users.

### Suggested Fix

In the electron-builder code that constructs the FPM command, resolve any file paths in the `fpm` configuration array relative to the project root (or `appDir`) before passing them to FPM. This would allow flags like `--deb-upstream-changelog` to work as expected.

Alternatively, add specific configuration options for commonly-needed files:

```json
{
  "deb": {
    "changelog": "path/to/changelog",  // resolved by electron-builder
    "fpm": [...]  // for other flags
  }
}
```
