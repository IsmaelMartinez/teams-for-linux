# Dependency Review (March 2026)

:::info Actionable Review
Evaluates all production dependencies for replacement, removal, or retention.
:::

**Date:** 2026-03-04 (review), 2026-03-06 (implemented)
**Status:** All three replacements implemented
**Author:** Claude AI Assistant

---

## Executive Summary

Teams for Linux had 9 production dependencies. This review evaluated each for maintenance status, necessity, and replacement options. Three dependencies had clear action items: `node-sound` (replace), `lodash` (remove), and `electron-positioner` (replace). All three have been implemented — the project now has 6 production dependencies.

---

## Dependencies with Recommended Actions

### 1. `node-sound` (v0.0.8) — REPLACED

**Status:** Implemented 2026-03-06

**Previous use:** Played WAV notification sounds via system audio commands (`paplay`, `aplay`, `afplay`).

**Replacement:** `app/audio/player.js` — uses `child_process.execFile` to detect and invoke system audio commands (`paplay`, `pw-play`, `aplay` on Linux; `afplay` on macOS; PowerShell `SoundPlayer` on Windows). Player detection runs in parallel with priority ordering, results are cached via a shared promise. The `NotificationService` interface is unchanged.

**Security hardening applied:** PowerShell invocation passes file paths as `$args[0]` rather than interpolating into the command string, preventing command injection. Detection uses promise caching to prevent duplicate child process spawning on concurrent calls. A prototype pollution guard was added to the `mergeWith` helper.

---

### 2. `lodash` (v4.17.23) — REMOVED

**Status:** Implemented 2026-03-06

**Previous use:** A single call to `_.mergeWith()` in `app/config/logger.js`.

**Replacement:** Inline `mergeWith` function in `app/config/logger.js` (~15 lines). Deep merges objects with a customizer callback, matching the Lodash semantics used. Includes a prototype pollution guard (`__proto__`, `constructor`, `prototype` keys are skipped).

---

### 3. `electron-positioner` (v4.1.0) — REPLACED

**Status:** Implemented 2026-03-06

**Previous use:** Positioned popup windows at screen corners using `positioner.move('bottomRight')` or `positioner.move('topRight')`.

**Replacement:** `app/utils/windowPositioner.js` (~25 lines) — uses Electron's built-in `screen.getDisplayMatching()` API to calculate `topRight` and `bottomRight` positions. Updated three consumers: `app/incomingCallToast/index.js`, `app/notificationSystem/NotificationToast.js`, `app/quickChat/QuickChatModal.js`.

---

## Dependencies to Retain

### 4. `@homebridge/dbus-native` (v0.7.3) — KEEP

**Current use:** D-Bus communication with Microsoft Identity Broker for Intune SSO authentication.
**Files:** `app/intune/index.js`

**Why keep:**

- Pure JavaScript D-Bus implementation (no native compilation despite the name)
- Essential for Intune SSO — no built-in Electron API provides D-Bus access
- Actively maintained (updated to 0.7.3 for ARM compatibility)
- No viable alternative; the only other option would be spawning `dbus-send` commands, which is fragile and loses type safety
- Linux-specific integration with no web API equivalent

**Note:** The `@homebridge` scope is because it's a maintained fork of the original `dbus-native` package.

---

### 5. `electron-log` (v5.4.3) — KEEP

**Current use:** Structured logging with file and console transports, PII sanitization hooks.
**Files:** `app/config/logger.js`, `app/graphApi/index.js`, `app/graphApi/ipcHandlers.js`

**Why keep:**

- Actively maintained with regular releases
- Provides file transport logging (essential for debugging user-reported issues)
- Supports log hooks for PII sanitization (critical per project guidelines)
- Replaces `console.*` globally with structured log functions
- No simpler alternative provides file logging + hooks in Electron's main process

---

### 6. `electron-store` (v11.0.2) — KEEP

**Current use:** Persistent configuration and settings storage (two named stores: "config" and "settings").
**Files:** `app/appConfiguration/index.js`

**Why keep:**

- Actively maintained by Sindre Sorhus
- Provides atomic writes, JSON schema validation, `clearInvalidConfig` safety
- Built specifically for Electron's `userData` path conventions
- Alternative would be raw `fs.writeFileSync` with JSON, losing atomicity and corruption protection

---

### 7. `electron-updater` (v6.8.3) — KEEP

**Current use:** Auto-update checking and installation for AppImage builds.
**Files:** `app/autoUpdater/index.js`

**Why keep:**

- Part of the `electron-builder` ecosystem, actively maintained
- Only runs for AppImage distribution (guarded by `process.env.APPIMAGE` check)
- Provides delta updates, progress tracking, and GitHub Releases integration
- No viable alternative for AppImage auto-updates

---

### 8. `electron-window-state` (v5.0.3) — KEEP

**Current use:** Persists and restores main window position and size across restarts.
**Files:** `app/mainAppWindow/browserWindowManager.js`

**Why keep:**

- Small, focused utility that does one thing well
- Handles edge cases (multi-monitor, display changes, fullscreen state)
- The `manage()` method automatically saves state on window move/resize events
- Replacing would require ~100+ lines of custom code for equivalent robustness
- Low maintenance burden — the API surface is stable

**Note:** This is technically unmaintained (last update 2+ years ago) but the API is stable and Electron's `BrowserWindow` events it depends on haven't changed. Worth monitoring but no action needed now.

---

### 9. `mqtt` (v5.15.0) — KEEP

**Current use:** MQTT broker connection for publishing Teams status and receiving action commands.
**Files:** `app/mqtt/index.js`

**Why keep:**

- Actively maintained with regular releases
- The MQTT protocol has no built-in browser/Electron API equivalent
- Feature is user-configurable and disabled by default
- Supports authentication, TLS, QoS levels, and LWT (Last Will and Testament)
- No simpler alternative exists for MQTT communication

---

### 10. `yargs` (v18.0.0) — KEEP

**Current use:** CLI argument parsing and config file loading with 60+ options.
**Files:** `app/config/index.js`

**Why keep:**

- Actively maintained, recently updated to v18
- Handles complex configuration: environment variables, config files, type coercion, deprecation warnings, help generation
- 60+ configuration options with types, defaults, and descriptions
- Replacing would require significant effort for equivalent functionality
- The `env(true)` feature (automatic environment variable mapping) would be particularly hard to replicate

---

## Summary

| Dependency | Version | Action | Status | Rationale |
|---|---|---|---|---|
| `node-sound` | 0.0.8 | **Replaced** | Done | `app/audio/player.js` using `execFile` |
| `lodash` | 4.17.23 | **Removed** | Done | Inline `mergeWith` in `app/config/logger.js` |
| `electron-positioner` | 4.1.0 | **Replaced** | Done | `app/utils/windowPositioner.js` using Electron `screen` API |
| `@homebridge/dbus-native` | 0.7.3 | Keep | — | Essential for Intune SSO, pure JS, maintained |
| `electron-log` | 5.4.3 | Keep | — | Structured logging with PII hooks, maintained |
| `electron-store` | 11.0.2 | Keep | — | Safe persistent storage, maintained |
| `electron-updater` | 6.8.3 | Keep | — | AppImage auto-updates, maintained |
| `electron-window-state` | 5.0.3 | Keep | — | Window state persistence, stable API |
| `mqtt` | 5.15.0 | Keep | — | MQTT protocol support, maintained |
| `yargs` | 18.0.0 | Keep | — | CLI/config parsing for 60+ options, maintained |
