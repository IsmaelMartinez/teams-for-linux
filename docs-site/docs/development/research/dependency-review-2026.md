# Dependency Review (March 2026)

:::info Actionable Review
Evaluates all production dependencies for replacement, removal, or retention.
:::

**Date:** 2026-03-04
**Status:** Review complete
**Author:** Claude AI Assistant

---

## Executive Summary

Teams for Linux has 9 production dependencies. This review evaluates each for maintenance status, necessity, and replacement options. Three dependencies have clear action items: `node-sound` (replace), `lodash` (remove), and `electron-positioner` (replace). The remaining six are well-justified and should be retained.

---

## Dependencies with Recommended Actions

### 1. `node-sound` (v0.0.8) — REPLACE

**Current use:** Plays WAV notification sounds via system audio commands (`paplay`, `aplay`, `afplay`).
**Files:** `app/index.js`, `app/notifications/service.js`

**Problems:**

- Unmaintained — no updates since initial release
- Requires native compilation via `node-gyp`
- Complicates Electron upgrades (must recompile against each new Node.js ABI)
- Opaque error handling

**Recommendation:** Replace with direct `execFile` calls (Strategy D from the [Notification Sound Overhaul Research](notification-sound-overhaul-research.md)). This is a Phase 1 change — create `app/audio/player.js` that detects available system audio commands at startup and plays files using `child_process.execFile`. The `NotificationService` interface stays identical. This is already researched and ready for implementation in v2.8.0.

**Effort:** Low. Behavior-preserving refactor, ~100 lines of new code.

---

### 2. `lodash` (v4.17.23) — REMOVE

**Current use:** A single call to `_.mergeWith()` in `app/config/logger.js`.

```javascript
_.mergeWith(log, config, (obj, src) =>
  typeof obj === "function" ? Object.assign(obj, src) : undefined,
);
```

**Problems:**

- Entire lodash library (~600KB unpacked) imported for one function
- The specific merge behavior can be replicated with a small helper function

**Recommendation:** Replace with a local `mergeWith` implementation. The merge logic is straightforward — deep merge objects, with a custom callback for function properties. A 15-20 line recursive function handles this without any dependency.

**Replacement code sketch:**

```javascript
function mergeWith(target, source, customizer) {
  for (const key of Object.keys(source)) {
    const customResult = customizer(target[key], source[key], key);
    if (customResult !== undefined) {
      target[key] = customResult;
    } else if (
      source[key] && typeof source[key] === 'object' && !Array.isArray(source[key]) &&
      target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])
    ) {
      mergeWith(target[key], source[key], customizer);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}
```

**Effort:** Very low. Single file change + remove dependency.

---

### 3. `electron-positioner` (v4.1.0) — REPLACE (inline)

**Current use:** Positions popup windows (notification toast, incoming call toast, quick chat modal) at screen corners using `positioner.move('bottomRight')` or `positioner.move('topRight')`.
**Files:** `app/incomingCallToast/index.js`, `app/mainAppWindow/notificationSystem/NotificationToast.js`, `app/quickChat/QuickChatModal.js`

**Problems:**

- Unmaintained — last published 7+ years ago
- Small utility (~100 lines) that wraps Electron's built-in `screen.getDisplayMatching()` API
- Only two position values are used: `bottomRight` and `topRight`

**Recommendation:** Replace with a small utility using Electron's built-in `screen` API. The two needed positions can be calculated in ~20 lines:

```javascript
const { screen } = require('electron');

function moveWindow(window, position) {
  const bounds = window.getBounds();
  const display = screen.getDisplayMatching(bounds);
  const workArea = display.workArea;

  const positions = {
    topRight: { x: workArea.x + workArea.width - bounds.width, y: workArea.y },
    bottomRight: { x: workArea.x + workArea.width - bounds.width, y: workArea.y + workArea.height - bounds.height },
  };

  const coords = positions[position];
  if (coords) {
    window.setPosition(coords.x, coords.y, false);
  }
}
```

**Effort:** Low. Create a small utility module and update three files.

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

| Dependency | Version | Action | Effort | Rationale |
|---|---|---|---|---|
| `node-sound` | 0.0.8 | **Replace** | Low | Unmaintained native addon; use `execFile` instead |
| `lodash` | 4.17.23 | **Remove** | Very low | Only one function used; inline it |
| `electron-positioner` | 4.1.0 | **Replace** | Low | Unmaintained; inline with Electron's `screen` API |
| `@homebridge/dbus-native` | 0.7.3 | Keep | — | Essential for Intune SSO, pure JS, maintained |
| `electron-log` | 5.4.3 | Keep | — | Structured logging with PII hooks, maintained |
| `electron-store` | 11.0.2 | Keep | — | Safe persistent storage, maintained |
| `electron-updater` | 6.8.3 | Keep | — | AppImage auto-updates, maintained |
| `electron-window-state` | 5.0.3 | Keep | — | Window state persistence, stable API |
| `mqtt` | 5.15.0 | Keep | — | MQTT protocol support, maintained |
| `yargs` | 18.0.0 | Keep | — | CLI/config parsing for 60+ options, maintained |

## Implementation Priority

1. **lodash removal** — smallest change, immediate size reduction (~600KB unpacked)
2. **node-sound replacement** — already researched, ready for v2.8.0
3. **electron-positioner replacement** — low effort, removes unmaintained dependency

All three can be done independently and in parallel.
