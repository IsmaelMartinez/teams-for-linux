---
id: 035-renderer-trust-boundary
---

# ADR 035: Renderer Trust Boundary with Context Isolation Disabled

## Status

✅ Implemented (v2.24.0 and v2.30.0)

The sender-pinning, emitter and webview fixes shipped in v2.24.0 ([PR #3053](https://github.com/IsmaelMartinez/teams-for-linux/pull/3053), [PR #3054](https://github.com/IsmaelMartinez/teams-for-linux/pull/3054), [PR #3055](https://github.com/IsmaelMartinez/teams-for-linux/pull/3055)). The preload hardening, credential-free config and session permission handlers shipped in v2.30.0 ([PR #3184](https://github.com/IsmaelMartinez/teams-for-linux/pull/3184), [PR #3185](https://github.com/IsmaelMartinez/teams-for-linux/pull/3185)). A navigation lock in front of the preload is the one item from the reports still open.

## Context

The Teams window runs with `contextIsolation: false` and `sandbox: false` because `reactHandler` reads Teams' React internals for presence, idle sync and custom backgrounds; `nodeIntegration` stays `false`. The [security architecture](../security-architecture.md) has recorded that trade-off since 2025, together with the compensating controls: CSP headers, the IPC channel allowlist and payload sanitiser, domain checks on DOM access.

Three private reports in October and November 2026 showed that the allowlist alone did not bound what page script could do, because with context isolation off the page and the preload share one JavaScript world:

- [GHSA-3vg9-cwq9-p773](https://github.com/IsmaelMartinez/teams-for-linux/security/advisories/GHSA-3vg9-cwq9-p773): the preload's listener helpers returned the result of `ipcRenderer.on`, which is the raw `ipcRenderer`, and passed Electron's IPC event (whose `sender` is the same object) to page callbacks. The picker channels then answered any sender, so web content could capture the desktop without consent.
- [GHSA-6xpg-fhf9-chcr](https://github.com/IsmaelMartinez/teams-for-linux/security/advisories/GHSA-6xpg-fhf9-chcr): the sticker importer wrote attacker-controlled bytes to disk and disclosed the path, and an unvetted `<webview>` could load that file as an unsandboxed preload, which runs with Node.js.
- [GHSA-58j7-22f8-6xqp](https://github.com/IsmaelMartinez/teams-for-linux/security/advisories/GHSA-58j7-22f8-6xqp): even after the first fix, page script could patch the shared built-ins (`Object.prototype`, `Function.prototype`, `WeakMap.prototype`, the array iterator), dispatch a synthetic `DOMContentLoaded` and have the preload re-initialise through code it controlled, recovering `ipcRenderer` from the objects that stored it. The generic `electronAPI.send` then reached every allowlisted channel, `get-config` returned the full configuration including MQTT and certificate passwords, no session had a permission handler so any popup or in-app page got microphone and camera without a prompt, and nothing stopped a navigation away from Teams while the privileged preload stayed attached.

The precondition in every case is script running in the Teams window, through an XSS in Teams web or a page loaded there. The reports made explicit what the earlier controls assumed away: a channel allowlist is not a boundary when the caller is inside the same world as the code that calls it.

## Decision

Treat the whole JavaScript world of the Teams window and of every profile view as page-controlled, and move trust to places page script cannot reach: preload closures, the sender frame as seen by the main process, and the session.

1. **Nothing Electron-native leaves the preload.** Listener helpers return nothing and strip the IPC event before calling back. The generic `electronAPI.send` is gone; the page sees only named `electronAPI` methods, each bound to a fixed channel with shaped arguments.
2. **`ipcRenderer` lives only in closures and private fields.** Browser tools flagged `ipc: true` still receive the full `ipcRenderer` through `init(config, ipcRenderer)`; the restriction is on where they keep it, in `#private` fields under strict mode, not on what they receive. The narrowing applies to the page-facing `electronAPI`, not to the tools. Strict mode is a security requirement, not style: `EventEmitter` calls listeners with `this` set to the raw `ipcRenderer`, and V8's `CallSite.getThis` hands that receiver to any sloppy-mode frame; `tests/unit/preloadIpcLeak.test.js` fails for any file that registers a listener without it.
3. **Initialisation runs once, on the browser's own event.** The `DOMContentLoaded` handler returns unless `event.isTrusted` and a module-level started flag is clear. The module list is walked with an indexed loop over own properties, not `for...of` or `Set.has`, and every entry sets its own `ipc` flag, because page script runs first and can patch the shared array and set built-ins or `Object.prototype`. The modules that need `ipcRenderer` (`trayIconRenderer` and `mqttStatusMonitor` among them, see CLAUDE.md and [#1902](https://github.com/IsmaelMartinez/teams-for-linux/issues/1902)) still receive it at init, through that guarded path.
4. **The main process trusts the sender frame, not the channel name.** `ipcValidator` keeps the allowlist and payload sanitiser, and adds sender pinning (`appPageOnlyChannels`): the screen-share picker channels, the profile channels and the two Graph channels that act as the user, `graph-api-search-people` and `graph-api-send-chat-message`, answer only `file:` senders inside the app directory. The read-only Graph channels (user profile, calendar, mail) are not pinned and stay reachable from the Teams page through `electronAPI.graphApi`. Profile URLs must be `https`. The wrapper in `ipcSecurity` makes a pending `once()` listener removable so a rejected sender cannot consume the picker's handler.
5. **The renderer gets a credential-free config.** `get-config` returns `toRendererConfig(config)` (`app/config/rendererConfig.js`), a copy without MQTT, basic-auth or client-certificate secrets, because anything that handler returns is readable by page script.
6. **Webview attach is refused everywhere.** `webviewTag: false` in the root window and every profile view, plus an app-wide `will-attach-webview` refusal for any webContents created later. The sticker importer additionally checks the declared image signature before saving.
7. **Device permissions follow the requester, on every session.** `app/security/permissions.js` installs request and check handlers on the default session and each profile partition. Teams, government Teams, the Microsoft sign-in hosts, the configured URL, `https` profile URLs and the app's own `file:` pages get full access. A cross-origin frame inside a trusted page keeps only what Chromium already gates per frame with Permissions Policy (media, display capture, clipboard, fullscreen). Any other page may only open `mailto:` and `tel:` links. Denials are logged once per permission and origin, without the URL path.

The rules above are the contract for every new browser tool: no return of Electron objects to the page, `ipcRenderer` in a private field, strict mode, and a sender check on any new privileged channel.

## Consequences

### Positive

Script in the Teams window is bounded to the allowlisted channels, with the argument shaping the preload applies, from the Teams frame only; it cannot capture the screen, read credentials, add a profile that loads another origin with the preload, or use the microphone from a popup. Each rule is enforced by code or a unit test rather than by review memory, which matters for a surface that has regressed before ([#1902](https://github.com/IsmaelMartinez/teams-for-linux/issues/1902)).

### Negative

The shared world remains. Context isolation is still off, so these are compensating controls around a missing boundary, not the boundary itself, and a future preload change can reopen a path by storing `ipcRenderer` on a reachable object or iterating with a patchable built-in. Every browser tool carries the extra discipline, and the trusted-requester list in `permissions.js` must be extended when Teams moves to a new host. The navigation lock from GHSA-58j7 item 4 is not in place yet: a top-level navigation out of Teams still carries the preload with it.

### Neutral

Popups opened from a profile view do not inherit the preload (Electron gives them context isolation, a sandbox and no preload), so their reach was already limited to permissions and phishing; the permission handlers close that remaining gap. The permission policy and the sender pinning are described operationally in the [security architecture](../security-architecture.md); this record holds the reasoning.

## Alternatives Considered

### Enable `contextIsolation` and expose a `contextBridge` API

Rejected again, for the reason recorded in the security architecture: `reactHandler` needs the page's React internals, and a bridge cannot hand those across an isolated world. Presence, idle sync, custom backgrounds and parts of the authentication flow depend on it.

### Enable the Electron `sandbox` for the Teams window

Rejected: the preload needs Node-side APIs (`webUtils`, the IPC surface the tools use) that a sandboxed preload does not get, and it would not by itself solve the shared-world problem.

### Keep the allowlist as the only control

What the project had. The reports showed the allowlist is bypassed by anyone who can reach `ipcRenderer`, and with one world that was any page script willing to patch a prototype.

## Related

- [Security Architecture](../security-architecture.md): implementation detail for each control
- [ADR-013](013-pii-log-sanitization.md): log hygiene that the denial logging follows
- [ADR-020](020-multi-account-profile-switcher.md): the profile views and partitions these handlers cover
- Advisories: [GHSA-3vg9-cwq9-p773](https://github.com/IsmaelMartinez/teams-for-linux/security/advisories/GHSA-3vg9-cwq9-p773), [GHSA-6xpg-fhf9-chcr](https://github.com/IsmaelMartinez/teams-for-linux/security/advisories/GHSA-6xpg-fhf9-chcr), [GHSA-58j7-22f8-6xqp](https://github.com/IsmaelMartinez/teams-for-linux/security/advisories/GHSA-58j7-22f8-6xqp)
- [PR #3053](https://github.com/IsmaelMartinez/teams-for-linux/pull/3053), [PR #3054](https://github.com/IsmaelMartinez/teams-for-linux/pull/3054), [PR #3055](https://github.com/IsmaelMartinez/teams-for-linux/pull/3055), [PR #3184](https://github.com/IsmaelMartinez/teams-for-linux/pull/3184), [PR #3185](https://github.com/IsmaelMartinez/teams-for-linux/pull/3185)
- Tests: `tests/unit/preloadIpcLeak.test.js`, `tests/unit/preloadModules.test.js`
