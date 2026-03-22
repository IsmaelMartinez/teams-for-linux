# Electron Alternatives Research

:::info Not Planned
Electron remains the only viable framework for wrapping Microsoft Teams on Linux. No alternative currently meets the project's requirements.
:::

**Date:** 2026-03-22
**Scope:** Evaluate whether any framework can replace Electron for this project
**Conclusion:** Stay with Electron; no viable alternative exists today

## Summary

Teams for Linux wraps the Microsoft Teams web application, which is built for and optimized for Chromium-based browsers. This Chromium dependency is the single most important constraint when evaluating alternatives. Any framework that does not use Chromium as its rendering engine on Linux will face fundamental rendering and functionality problems with Teams.

After evaluating all major alternatives, **Electron is the only framework that provides the full set of capabilities this project requires**: real Chromium rendering, robust cookie and session management, certificate error handling, proxy support, system tray integration, JavaScript injection, and a mature packaging/distribution ecosystem.

---

## Frameworks Evaluated

### Tauri 2.0

**What it is:** Rust-based framework using the OS native webview (WebKitGTK on Linux, WebView2 on Windows, WKWebView on macOS). Tauri 2.0 went stable in October 2024 with strong community momentum (88k+ GitHub stars).

**Why it doesn't work:**

1. **WebKitGTK on Linux, not Chromium.** Teams is optimized for Chromium. WebKit rendering differences, missing Web APIs, and CSS quirks would cause functional issues. This is the fundamental blocker.
2. **No `set_cookie` API.** Cookie manipulation is essential for this project's session management. Open issues: [tauri#11691](https://github.com/tauri-apps/tauri/issues/11691), [wry#1511](https://github.com/tauri-apps/wry/issues/1511).
3. **No certificate error handling.** No equivalent to Electron's `certificate-error` event. Self-signed cert handling is an [open issue (#4039)](https://github.com/tauri-apps/tauri/issues/4039). Blocks enterprise environments with custom CAs.

**What it does well:** ~10 MB binary size (vs Electron's ~200 MB), ~30-40 MB memory idle, built-in system tray, JS injection via `initialization_script`, proxy support.

**Revisit when:** Tauri gains a Chromium-on-Linux option, or Microsoft improves Teams' WebKit compatibility. Neither appears imminent.

### NW.js (node-webkit)

**What it is:** Bundles Chromium + Node.js, similar to Electron. Latest release v0.109.0 (March 2026) with Chromium 146.

**Why it doesn't work:** Offers no meaningful advantage over Electron while having a smaller ecosystem, weaker security model (merged Node/browser context with no process isolation), and less tooling. Migration would require rearchitecting the IPC layer due to the different process model (shared context vs message passing). Binary size and memory are comparable to Electron.

### Chromium Embedded Framework (CEF)

**What it is:** Embeds actual Chromium without Node.js. C/C++ API. Used by Spotify, Steam, and many AAA games. Very mature.

**Why it doesn't work:** Uses real Chromium so Teams would render correctly. However, the C/C++ primary API means rewriting the entire application. No built-in APIs for tray, notifications, or other conveniences Electron provides. No npm ecosystem. The development effort would be enormous for no user-facing benefit. The [Energy framework](https://github.com/energye/energy) (Go-based CEF wrapper) exists but is not mature enough.

### Neutralinojs

**What it is:** Lightweight framework (~2 MB binary) using the OS native web rendering engine with a WebSocket-based communication layer.

**Why it doesn't work:** Same WebKit-on-Linux problem as Tauri. Described as mostly a single-developer hobby project. No sophisticated cookie API, no certificate handling, no proxy support, no built-in installer/auto-updater. Too immature for a production application of this complexity.

### WRY (Standalone)

**What it is:** The low-level Rust webview library that Tauri is built on. Can be used directly.

**Why it doesn't work:** Same WebKitGTK-on-Linux engine. Using WRY directly means building your own application shell, IPC, tray management, etc. from scratch in Rust. You'd be rebuilding most of what Electron provides.

### Other Notable Mentions

- **Gluon:** Uses the system-installed browser (Chrome or Firefox). Relies on user having a compatible browser. Very small project, not production-ready.
- **Sciter:** Proprietary 5 MB HTML/CSS/JS runtime. Does not implement standard HTML5/W3C. Cannot load arbitrary web applications. Not applicable.
- **Pake:** Tauri-based website wrapper. Inherits all Tauri limitations. Designed for simple wrappers, not complex apps with custom JS injection, tray integration, and MQTT.

---

## Comparison Matrix

| Framework | Chromium on Linux | Binary Size | Cookie API | Cert Handling | Proxy | System Tray | JS Injection | Maturity |
|---|---|---|---|---|---|---|---|---|
| **Electron** (current) | Yes | ~200 MB | Full | Full | Full | Yes | Yes | Very High |
| **Tauri 2.0** | No (WebKitGTK) | ~10 MB | Partial | Weak | Yes | Yes | Yes | Medium-High |
| **NW.js** | Yes | ~200 MB | Full | Full | Full | Yes | Yes | Medium |
| **CEF** | Yes | ~200 MB | Full | Full | Full | DIY | Yes | Very High |
| **Neutralinojs** | No (system) | ~2 MB | No | No | No | Yes | Limited | Low |

---

## Capability Requirements

These are the specific capabilities this project relies on from Electron, and why they matter:

1. **Chromium rendering engine on Linux** -- Teams is a Chromium-optimized web app. WebKit-based renderers produce layout, API, and functional issues.
2. **Cookie manipulation** -- Session management, login persistence, and the `customCACertsFingerprints` feature depend on programmatic cookie access.
3. **Certificate error handling** -- Enterprise environments use custom CAs and self-signed certificates. The `certificate-error` event is essential.
4. **Proxy support** -- Corporate networks require HTTP/SOCKS proxy configuration.
5. **JavaScript injection** -- The project injects scripts for themes, tray icon rendering, MQTT status monitoring, notifications, and activity detection.
6. **System tray** -- Badge counts, status indicators, and quick actions.
7. **IPC (Inter-Process Communication)** -- Extensive main-to-renderer communication for 30+ channels.
8. **Mature packaging ecosystem** -- electron-builder produces AppImage, deb, rpm, snap, and Flatpak from a single config.
9. **Auto-updater** -- electron-updater provides AppImage delta updates.

---

## Recommendation

**Stay with Electron.** No alternative framework currently meets all of this project's requirements. The Chromium rendering requirement alone eliminates Tauri, Neutralinojs, and WRY. The remaining Chromium-based options (CEF, NW.js) would require massive rewrites with no user-facing benefit.

**Monitor Tauri's evolution** for:

- Chromium-on-Linux support (would fundamentally change the calculus)
- Cookie manipulation APIs ([tauri#11691](https://github.com/tauri-apps/tauri/issues/11691))
- Certificate error handling ([tauri#4039](https://github.com/tauri-apps/tauri/issues/4039))
- Microsoft improving Teams' cross-browser (WebKit) compatibility

---

## Sources

- [Tauri 2.0 Stable Release](https://v2.tauri.app/blog/tauri-20/)
- [Tauri GitHub](https://github.com/tauri-apps/tauri) (88k+ stars)
- [Tauri vs Electron -- DoltHub](https://www.dolthub.com/blog/2025-11-13-electron-vs-tauri/)
- [Tauri vs Electron -- Hopp Blog](https://www.gethopp.app/blog/tauri-vs-electron)
- [CEF GitHub](https://github.com/chromiumembedded/cef)
- [NW.js GitHub](https://github.com/nwjs/nw.js/)
- [Neutralinojs GitHub](https://github.com/neutralinojs/neutralinojs)
- [Awesome Electron Alternatives](https://github.com/sudhakar3697/awesome-electron-alternatives)
