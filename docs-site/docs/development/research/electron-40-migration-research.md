# Electron 40 Migration Research

**Date:** 2026-02-14
**Current Version:** Electron 39.5.1 (Chromium 142, Node.js 22.20.0, V8 14.2)
**Target Version:** Electron 40.4.0 (Chromium 144, Node.js 24.11.1, V8 14.4)
**Risk Level:** Medium

## Summary

The Electron 39 to 40 upgrade is a relatively clean migration with **no blocking breaking changes** for this project. The primary areas requiring attention are: native module recompilation (Node.js 22 to 24), verifying Chromium feature flag behavior, and testing the `window.open` resizable popup behavior change from Electron 39. ESLint 10 and routine dependency updates can be done alongside or separately.

---

## Electron 40 Breaking Changes

### 1. Deprecated: Clipboard API from Renderer Processes

**Impact: None (not affected)**

Electron 40 deprecates calling the `clipboard` API directly from renderer processes. Apps should route clipboard calls through preload scripts and `contextBridge`.

**Codebase audit:** All clipboard usage is in the **main process** (`app/menus/index.js:288` for `clipboard.readText()` and `app/menus/index.js:406` for `clipboard.writeText()`). No renderer-side clipboard usage exists. No changes needed.

### 2. macOS Debug Symbol Compression Change

**Impact: None (CI/CD only)**

Debug symbols (dSYM) for macOS now use `tar.xz` instead of `zip`. This only affects macOS debug workflows, not the application code. No changes needed.

---

## Electron 39 Breaking Changes (Verify Already Addressed)

These broke in Electron 39 but should be verified since we're on 39.5.1:

### 3. `window.open` Popups Always Resizable

**Impact: Low - verify behavior**

Per the WHATWG spec, popups created via `window.open` are now always resizable. The project uses `setWindowOpenHandler` in `app/mainAppWindow/index.js:598` via the `onNewWindow` function, which returns `{ action: "deny" }` for internal URLs or delegates to `secureOpenLink()` for external ones. Since the project mostly denies popups or opens them externally via `shell.openExternal()`, this change should have minimal impact. **Verify during testing** that no popup behavior has regressed.

### 4. Deprecated: `--host-rules` Command Line Switch

**Impact: None (not affected)**

The `--host-rules` switch is deprecated in favor of `--host-resolver-rules`. A search confirms this project does not use either flag. No changes needed.

### 5. `NSAudioCaptureUsageDescription` Required (macOS >= 14.2)

**Impact: Low - macOS only**

macOS apps must include `NSAudioCaptureUsageDescription` in `Info.plist` to use `desktopCapturer`. The project's `package.json` already includes `NSCameraUsageDescription` and `NSMicrophoneUsageDescription` in the `mac.extendInfo` build config. **Action: Add `NSAudioCaptureUsageDescription`** to the mac build config for completeness, or disable the `MacCatapLoopbackAudioForScreenShare` feature flag if audio capture from screen share is not needed.

---

## Stack Upgrade Impact

### Node.js 22 to 24

This is the most significant part of the upgrade. Key changes:

#### OpenSSL 3.5 Security Level 2

**Impact: Low - unlikely to affect Teams web app**

RSA/DSA/DH keys shorter than 2048 bits and ECC keys shorter than 224 bits are now prohibited. RC4-based cipher suites are no longer permitted. This could theoretically affect connections to older corporate infrastructure. **Monitor** for TLS handshake failures during testing.

#### Deprecated APIs

**Impact: None for this project**

- `url.parse()` deprecated in favor of WHATWG `URL` - the codebase does not use `url.parse()`
- `tls.createSecurePair()` removed - not used
- `SlowBuffer` deprecated - not used
- `dirent.path` replaced with `dirent.parentPath` - not used directly

#### Native Module Recompilation

**Impact: Medium - requires rebuild**

The V8 module version bumps to 137, requiring all native addons to be recompiled. The project has:

- **`node-sound` (^0.0.8)**: Native addon for audio playback. Already wrapped in try/catch at `app/index.js:56`, so a build failure degrades gracefully. The `postinstall` script (`electron-builder install-app-deps`) should handle recompilation.
- **`@homebridge/dbus-native` (0.7.2)**: Pure JavaScript D-Bus implementation despite the name. No native compilation needed. Target update to 0.7.3.

#### Stricter Validation

**Impact: Low**

Buffer APIs, `fs.symlink()`, and timer APIs have stricter type validation in Node 24. The project's code uses standard patterns and should not be affected.

### Chromium 142 to 144

#### Private Network Access Permission Prompt (Chrome 142)

**Impact: Low - verify behavior**

Chrome 142 added permission prompts for requests from public websites to local network addresses. Since Teams for Linux wraps `teams.microsoft.com`, requests to local services (e.g., MQTT broker) go through the main process (`app/mqtt/` module), not the renderer. Unlikely to be affected, but **verify** during testing.

#### XSLT Deprecation (Chrome 143+)

**Impact: None**

XSLT is being deprecated from the web platform. The project does not use XSLT.

#### Pointer/Mouse Boundary Event Changes (Chrome 144)

**Impact: None for main process, possibly minor for Teams web UI**

Boundary events (over, out, enter, leave) now target the nearest ancestor in DOM when the original target is removed. This is a Chromium behavior change that could theoretically affect the Teams web app's hover/tooltip behavior. Not something we can control; just note for testing.

#### Post-Quantum Cryptography for WebRTC (Chrome 144)

**Impact: Low - positive**

Chrome 144 enables post-quantum cryptography for WebRTC connections. This is transparent and should improve security for video calls.

### V8 14.2 to 14.4

**Impact: None**

Minor V8 upgrade. No breaking JavaScript language changes.

---

## New Features Worth Considering

### `app.isHardwareAccelerationEnabled()`

**Relevance: Medium**

New API to check hardware acceleration status. Could be useful for the GPU disable logic in `app/startup/commandLine.js` and the existing GPU info window (`app/gpuInfoWindow/`). Not critical for migration but could improve diagnostics.

### `systemPreferences.getAccentColor()` on Linux

**Relevance: Low**

New Linux support for reading the system accent color. The project uses `nativeTheme.shouldUseDarkColors` for theme detection (`app/mainAppWindow/browserWindowManager.js:147`). The accent color API could enable future theme matching but is not needed for migration.

### Dynamic ESM Imports in Non-Context-Isolated Preloads

**Relevance: Low**

The main preload (`app/browser/preload.js`) runs with `contextIsolation: false` and uses CommonJS `require()`. This new capability opens the door to ESM migration in preloads but is not needed now.

### WebSocket Authentication via Login Event

**Relevance: Low**

New ability to handle WebSocket authentication through the `login` event on `webContents`. Could be relevant for future MQTT-over-WebSocket features but not needed for migration.

### File System API Grant Persistence

**Relevance: Low**

File System API grants can now persist within sessions. Not currently used by the project.

---

## Chromium Feature Flags Audit

The project uses two Chromium feature flags in `app/startup/commandLine.js`:

1. **`WebRTCPipeWireCapturer`** (enabled on Wayland) - Still valid in Chromium 144. This flag enables PipeWire-based screen capture on Wayland.

2. **`HardwareMediaKeyHandling`** (disabled) - Still valid in Chromium 144. This prevents conflicts between Teams media controls and system media keys.

**Action:** Verify both flags still exist and behave correctly in Chromium 144. Check the [Chrome Platform Status](https://chromestatus.com/) for any flag renames or removals.

---

## Dependency Updates (Alongside Electron 40)

### Major Version Bumps

| Package | Current | Target | Breaking Changes |
|---------|---------|--------|------------------|
| Electron | 39.5.1 | 40.4.0 | See above |
| ESLint | 9.39.2 | 10.x | See ESLint section below |
| @eslint/js | 9.39.2 | 10.x | Tied to ESLint major |

### Minor/Patch Bumps (Low Risk)

| Package | Current | Target | Notes |
|---------|---------|--------|-------|
| @homebridge/dbus-native | 0.7.2 | 0.7.3 | Pure JS, confirmed Node 24 compatible |

---

## ESLint 10 Migration

ESLint 10.0.0 was released on 2026-02-06. Key changes:

### Node.js Version Requirement

ESLint 10 requires Node.js >= 20.19. Since Electron 40 bundles Node 24.11.1, this is satisfied for development. Developers running ESLint outside of Electron need Node >= 20.19.

### Config File Lookup Change

**Impact: None**

ESLint 10 locates `eslint.config.*` by starting from the directory of each linted file (important for monorepos). This project is a single-root project with one `eslint.config.mjs` at the root. No impact.

### Legacy Configuration Fully Removed

**Impact: None**

The project already uses flat config (`eslint.config.mjs`). No `.eslintrc` files exist. No changes needed.

### Deprecated API Methods Removed

**Impact: None for project config, possible impact on plugins**

Methods like `context.getFilename()`, `context.getCwd()`, `context.getSourceCode()` are removed in ESLint 10. These affect ESLint plugin authors, not configuration consumers. Verify that `@eslint/js` 10.x and any other plugins are compatible.

### JSX Reference Tracking

**Impact: None**

This project does not use JSX/React in the Electron app code.

### Stylish Formatter: Chalk to Node.js styleText

**Impact: None**

Minor internal change. The `NO_COLOR` environment variable is now respected more consistently.

### Migration Steps

1. Update `eslint` and `@eslint/js` to 10.x in `devDependencies`
2. Update `globals` if needed for compatibility
3. Run `npm run lint` and fix any new violations from updated recommended rules
4. Verify the existing `eslint.config.mjs` works without modification (it should)

---

## Migration Checklist

### Pre-Migration

- [ ] Create feature branch for Electron 40 upgrade
- [ ] Review this research document

### Electron 40 Upgrade

- [ ] Update `electron` from `39.5.1` to `40.4.0` in `package.json`
- [ ] Run `npm install` to trigger `electron-builder install-app-deps` for native module rebuild
- [ ] Verify `node-sound` native module compiles successfully against Node 24
- [ ] Add `NSAudioCaptureUsageDescription` to mac build config (if macOS audio capture desired)

### Testing

- [ ] Run `npm run lint` - verify no new lint errors
- [ ] Run `npm run test:e2e` - verify E2E tests pass
- [ ] Manual test: Application startup and Teams login
- [ ] Manual test: Screen sharing (both X11 and Wayland if available)
- [ ] Manual test: Tray icon, badge counts, notifications
- [ ] Manual test: MQTT status publishing
- [ ] Manual test: Clipboard operations (copy link from context menu)
- [ ] Manual test: Popup/external link handling (`setWindowOpenHandler`)
- [ ] Manual test: Spell check functionality
- [ ] Manual test: Audio playback (notification sounds)
- [ ] Verify Chromium feature flags (`WebRTCPipeWireCapturer`, `HardwareMediaKeyHandling`)
- [ ] Check for TLS handshake errors with corporate infrastructure (OpenSSL 3.5)

### ESLint 10 (Can Be Separate PR)

- [ ] Update `eslint` and `@eslint/js` to 10.x
- [ ] Update `globals` package if needed
- [ ] Run `npm run lint` and fix any new violations
- [ ] Verify `eslint.config.mjs` works without modification

### Routine Dependency Updates (Can Be Separate PR)

- [ ] Update `@homebridge/dbus-native` from 0.7.2 to 0.7.3

### Post-Migration

- [ ] Update roadmap to reflect completed Electron 40 upgrade
- [ ] Create ADR if any significant architectural decisions were made
- [ ] Monitor for user-reported issues after release

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| `node-sound` fails to compile with Node 24 | Low | Low | Already wrapped in try/catch; graceful degradation |
| OpenSSL 3.5 rejects corporate TLS certs | Low | Medium | Monitor during testing; can add `--tls-min-v1.0` flag if needed |
| Chromium feature flag renamed/removed | Low | High | Verify flags in Chromium 144 source before release |
| `window.open` popup behavior regression | Low | Low | Teams mostly uses internal navigation; popups are denied |
| ESLint 10 plugin incompatibility | Low | Low | Can stay on ESLint 9 temporarily if needed |

---

## Recommendation

**Proceed with the upgrade.** The Electron 39 to 40 migration has no blocking breaking changes for this project. The recommended approach:

1. **Single PR for Electron 40**: Update Electron, rebuild native modules, add macOS audio description, run full test suite
2. **Separate PR for ESLint 10**: Lower risk, independent change
3. **Separate PR for routine deps**: `@homebridge/dbus-native` 0.7.3

This keeps each PR focused and makes bisecting easier if issues arise.

---

## References

- [Electron 40.0.0 Release Notes](https://www.electronjs.org/blog/electron-40-0)
- [Electron Breaking Changes](https://www.electronjs.org/docs/latest/breaking-changes)
- [Node.js v22 to v24 Migration Guide](https://nodejs.org/en/blog/migrations/v22-to-v24)
- [ESLint v10.0.0 Migration Guide](https://eslint.org/docs/latest/use/migrate-to-10.0.0)
- [Chrome 144 Release Notes](https://developer.chrome.com/release-notes/144)
- [ADR-008: useSystemPicker Electron 38](../adr/008-usesystempicker-electron-38.md) - Still valid; no change in Electron 40
