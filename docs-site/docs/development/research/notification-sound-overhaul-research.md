# Notification Sound Overhaul Research

:::info Ready for Implementation
Research complete. Targeted for v2.8.0 release.
:::

**Date:** 2026-02-22
**Status:** Research complete
**Issue:** Replace `node-sound` native addon, consolidate notification sound configuration
**Author:** Claude AI Assistant
**Related:** [Custom Notification System Research](custom-notification-system-research.md), [Configuration Organization Research](configuration-organization-research.md)

---

## Executive Summary

The notification sound system currently depends on `node-sound`, an unmaintained native addon that wraps system audio players (`paplay`, `aplay`, `afplay`). This document evaluates replacement strategies, reports findings from a hands-on prototype session, and proposes a phased improvement plan that consolidates the fragmented notification configuration into a coherent system.

The key discovery is that Chromium's autoplay policy blocks all renderer-side audio (both `AudioContext` and `HTMLAudioElement`) after the first play unless the `--autoplay-policy=no-user-gesture-required` command-line switch is set. This switch has already been added to the codebase and is the prerequisite for any Web Audio approach.

---

## 1. Current State

### How Sound Playback Works Today

The notification sound pipeline has three participants:

The **renderer** (preload.js) intercepts `new Notification()` calls from the Teams web app. Depending on the configured `notificationMethod` ("web", "electron", or "custom"), it constructs a sound descriptor containing `type`, `audio`, `title`, and `body`, then calls `globalThis.electronAPI.playNotificationSound(descriptor)` which invokes the main process via IPC (`play-notification-sound` channel).

The **main process** (`NotificationService` in `app/notifications/service.js`) receives the IPC call, checks whether sound is disabled via config or user status, looks up a WAV file path from `#notificationSounds` by matching the `type` field, and calls `await this.#soundPlayer.play(filePath)`.

The **player** (`node-sound`) spawns a system audio command (`paplay` on PulseAudio, `aplay` on ALSA, `afplay` on macOS) as a child process to play the WAV file.

### Sound Files

Two WAV files ship in `app/assets/sounds/` and are copied to the packaged app via `extraResources`:

- `new_message.wav` (268 KB) for incoming chat messages
- `meeting_started.wav` (215 KB) for meeting start notifications

### Configuration Options

Sound-related configuration is currently scattered across three unrelated config keys:

`disableNotificationSound` (boolean, default false) disables all notification sounds globally. `disableNotificationSoundIfNotAvailable` (boolean, default false) suppresses sounds when the user's Teams status is not "Available" or "Unknown". `notificationMethod` ("web" | "electron" | "custom", default "web") controls the notification display method, but also indirectly affects sound because the "electron" path plays sound through `NotificationService.#showNotification` while the "web" and "custom" paths play it from preload.js via IPC.

There is no configuration for choosing custom sound files, adjusting volume, or selecting per-notification-type sounds.

### Problems with `node-sound`

The `node-sound` package (v0.0.8) has several practical issues. It is unmaintained, with no updates since its initial release. It requires native compilation via `node-gyp`, which adds build complexity and can fail on systems without build tools. It depends on specific system audio players being installed (`paplay`, `aplay`, or `afplay`), which means sound silently fails if none are available. The error handling is opaque since `player.play()` returns a promise but provides no useful error information when the system command fails. Finally, as a native addon, it complicates Electron upgrades because the addon must be recompiled against each new Node.js ABI version.

---

## 2. Replacement Strategies Evaluated

### Strategy A: Web Audio API (AudioContext) in Renderer

This approach generates tones programmatically using `AudioContext` in the renderer process, eliminating the need for WAV files entirely.

During prototyping, an `AudioContext` with oscillator nodes (880Hz fundamental + 1760Hz harmonic, sine waves with exponential decay) produced a recognizable bell chime. The sound was compact, required zero file I/O, and worked cross-platform without system dependencies.

The critical issue encountered was Chromium's autoplay policy. After the first notification played successfully, subsequent `AudioContext` operations were silently blocked. The context enters a "suspended" state and `ctx.resume()` requires a user gesture that background notifications cannot provide. Adding `--autoplay-policy=no-user-gesture-required` to Electron's command-line switches resolved this completely. This switch has been merged and is present in `app/startup/commandLine.js`.

Advantages: no native dependencies, no external files, works on all platforms, tiny footprint, fully configurable (frequency, duration, envelope). Disadvantages: synthesized tones sound different from the original WAV notification sounds, requires the autoplay policy switch, limited to sounds that can be generated programmatically.

### Strategy B: Data URI + HTMLAudioElement in Renderer

This approach reads WAV files in the main process, converts them to base64 data URIs, passes them to the renderer via IPC, and plays them with `new Audio(dataUri).play()`.

Prototyping confirmed this works and preserves the original notification sounds exactly. The data URIs are generated once at startup and cached. However, `HTMLAudioElement.play()` is also subject to the same autoplay policy, so the `--autoplay-policy` switch is equally required here.

Advantages: preserves original sounds, works cross-platform, no native dependencies. Disadvantages: base64 encoding inflates WAV size by ~33%, requires IPC round-trip for initial data URI transfer, still needs the autoplay policy switch.

### Strategy C: Blob URL + HTMLAudioElement in Renderer

This approach reads WAV files directly in the renderer using `fs.promises.readFile` (available in preload with `nodeIntegration` access), creates a `Blob`, generates an `objectURL`, and plays with `new Audio(blobUrl).play()`.

During prototyping, this approach failed silently. The audio element loaded but never played. The likely cause is Teams' Content Security Policy blocking `blob:` URLs as media sources, or context isolation interfering with `Blob` construction. This approach was abandoned.

### Strategy D: Spawning System Audio Commands (Main Process)

This approach replaces `node-sound` with a direct `execFile` call in the main process, invoking the same system commands (`paplay`, `aplay`, `afplay`) without the native addon wrapper. Using `execFile` (not `exec`) avoids shell injection risks since arguments are passed as an array rather than interpolated into a shell command string.

This is the simplest drop-in replacement. It eliminates the native compilation requirement while maintaining identical behavior. The main process already has full Node.js access, so no preload or renderer changes are needed.

Advantages: minimal code change, no new dependencies, preserves original sounds, no autoplay policy concerns (main process, not renderer). Disadvantages: still depends on system audio players being installed, still platform-specific, no graceful fallback.

### Strategy E: Electron's Built-in Audio (shell.beep or BrowserWindow)

Electron's `shell.beep()` plays the system alert sound but cannot play custom WAV files. A hidden `BrowserWindow` could load and play audio, but this is heavyweight for notification sounds. Neither approach is practical.

---

## 3. Recommendation

The recommended approach combines Strategies A and D in two phases, with a configuration consolidation layer on top.

Phase 1 replaces `node-sound` with a simple main-process audio player using `execFile`. This is a low-risk, minimal change that removes the native addon dependency while keeping identical behavior. Users hear the same sounds, the same config works, and the packaging is unchanged.

Phase 2 adds Web Audio as an alternative renderer-side player (using `AudioContext`) and introduces user-configurable sounds. The autoplay policy switch is already in place, so `AudioContext` tone generation can work reliably. This phase also consolidates the scattered notification config into a grouped structure.

---

## 4. Proposed Implementation

### Phase 1: Replace `node-sound` with execFile

**Scope:** Remove `node-sound` dependency, implement a lightweight audio player in the main process.

Create a new module `app/audio/player.js` that detects available system audio commands at startup and plays files using `execFile` from `node:child_process`. The detection order should be: `paplay` (PulseAudio/PipeWire, most common on modern Linux), `pw-play` (PipeWire native), `aplay` (ALSA fallback), `afplay` (macOS), `powershell` with `[System.Media.SoundPlayer]` (Windows). If no player is found, the module logs a warning and becomes a no-op, matching current `node-sound` behavior.

The `NotificationService` interface stays identical: `await this.#soundPlayer.play(filePath)`. Only the player implementation changes.

Files to create: `app/audio/player.js`, `app/audio/README.md`. Files to modify: `app/index.js` (replace `node-sound` import with new player), `package.json` (remove `node-sound`).

**Risk:** Low. Behavior-preserving refactor.

### Phase 2: Configuration Consolidation and Custom Sounds

**Scope:** Group notification settings, add custom sound file support, add Web Audio fallback.

Consolidate the scattered notification config keys under a `notification` namespace. The new structure would group related options together rather than having them at the top level:

```yaml
notification:
  method: "web"              # was: notificationMethod
  disableSound: false         # was: disableNotificationSound
  disableSoundIfNotAvailable: false  # was: disableNotificationSoundIfNotAvailable
  disableWindowFlash: false   # was: disableNotificationWindowFlash
  disableBadgeCount: false    # was: disableBadgeCount
  defaultUrgency: "normal"   # was: defaultNotificationUrgency
  sounds:
    new-message: "default"    # "default" | path to WAV/OGG | "none"
    meeting-started: "default"
  customToast:
    duration: 5000            # was: customNotification.toastDuration
```

The old top-level keys would remain supported through deprecation aliases in `AppConfiguration` to avoid breaking existing user configs. The `sounds` map allows users to specify custom sound files per notification type, or "none" to disable a specific sound while keeping others.

If a user specifies a sound file path, the main-process player from Phase 1 plays it. If set to "default", the built-in WAV plays. This keeps the simple case simple while allowing power users to customize.

**Risk:** Medium. Config migration requires deprecation aliases and documentation updates.

### Phase 3: Web Audio Fallback (Optional)

**Scope:** Add renderer-side AudioContext as a fallback when no system player is available.

If Phase 1's player detects no available system audio commands, the main process notifies the renderer (via a config flag or IPC response), and the renderer falls back to generating a notification chime using `AudioContext`. This provides sound on systems without `paplay`/`aplay` installed, such as minimal container environments or unusual desktop setups.

The `AudioContext` chime implementation was prototyped during this research and works reliably with the autoplay policy switch in place. The synthesized tone would be a bell-like chime (880Hz + 1760Hz partials, exponential decay over 400ms) rather than the original WAV sounds.

**Risk:** Low, since this is purely additive and only activates when the primary player is unavailable.

---

## 5. Custom Notification Sound Integration

The custom notification system (`notificationMethod: "custom"`) currently plays sound through the same `playNotificationSound` IPC path as "web" notifications. Both call into `NotificationService.#playNotificationSound` on the main process, which uses the `#soundPlayer`.

The "electron" notification method is different: `NotificationService.#showNotification` calls `#playNotificationSound` internally before creating the `Notification` object. This means the sound and visual notification are tightly coupled for the "electron" method but decoupled for "web" and "custom" methods.

During testing, the custom notification method exhibited sound issues that appeared unrelated to the audio backend. These warrant separate investigation but should be resolved naturally by the configuration consolidation in Phase 2, which unifies the sound pipeline across all notification methods.

---

## 6. Autoplay Policy Discovery

The most significant technical finding from this research is that Chromium's autoplay policy affects all renderer-side audio in Electron, not just `AudioContext`. Both `AudioContext` and `HTMLAudioElement` are subject to the same restriction: after the first play, subsequent audio requires a user gesture unless the autoplay policy is disabled.

The `--autoplay-policy=no-user-gesture-required` command-line switch overrides this restriction globally. It has been added to `CommandLineManager.addSwitchesBeforeConfigLoad()` in `app/startup/commandLine.js` and is now active in the codebase. This switch is safe for this application because Teams for Linux is a desktop app where the user has already consented to run it, unlike a web browser where the policy prevents unwanted auto-playing media.

This switch is a prerequisite for Phase 3 (Web Audio fallback) and for any future renderer-side audio work.

---

## 7. Open Questions

Should the Phase 2 config migration be done as part of the broader configuration organization effort described in `configuration-organization-research.md`? Combining them would reduce the number of config migrations users experience, but increases the scope of that work.

Should Phase 1 also add Windows support via PowerShell's `SoundPlayer`? The current `node-sound` doesn't support Windows either, so this would be a new capability. Adding it is straightforward but should be validated by a Windows user.

Should custom sounds support OGG/Opus in addition to WAV? System players like `paplay` and `pw-play` handle both formats natively, and OGG files are significantly smaller. This could reduce the packaged app size.

---

## 8. Related Resources

- [Custom Notification System Research](custom-notification-system-research.md) for the custom toast notification implementation
- [Configuration Organization Research](configuration-organization-research.md) for the broader config restructuring plan
- [Electron 40 Migration Research](electron-40-migration-research.md) for Node.js ABI considerations affecting native addons
- [Chromium Autoplay Policy](https://developer.chrome.com/blog/autoplay/) for background on the autoplay restriction
- [Web Audio API spec](https://webaudio.github.io/web-audio-api/) for AudioContext capabilities
