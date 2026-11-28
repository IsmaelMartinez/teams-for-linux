# Security Architecture & Considerations

This document outlines the security architecture, design decisions, and compensating controls implemented in Teams for Linux, particularly around the DOM access requirements and security trade-offs. The reasoning behind the renderer-side controls is recorded in [ADR-035](adr/035-renderer-trust-boundary.md).

## Security Context

### The DOM Access Requirement

Teams for Linux requires DOM access to Microsoft Teams' React components to provide core functionality:

- **User Status Tracking**: Monitor and sync user presence state
- **Custom Background Integration**: Inject custom background options into Teams interface
- **System Idle Management**: Sync system idle state with Teams presence
- **Authentication Flow Enhancement**: Improve login experience and reduce re-authentication

### Security vs. Functionality Trade-off

The application faces a fundamental security vs. functionality trade-off:

**Option A: Maximum Security**
- Enable Electron `contextIsolation` and `sandbox`
- ❌ Breaks all DOM access functionality
- ❌ Eliminates core application features

**Option B: Balanced Security** (Current Approach)
- Disable `contextIsolation` and `sandbox` for main window
- ✅ Restore all DOM access functionality  
- ✅ Implement comprehensive compensating controls
- ✅ Recommend system-level sandboxing

## Current Security Implementation

### Electron Security Configuration

```javascript
// app/mainAppWindow/browserWindowManager.js
webPreferences: {
  contextIsolation: false,  // Required for ReactHandler DOM access
  nodeIntegration: false,   // Secure: preload scripts don't need this
  sandbox: false,           // Required for system API access
}
```

**Key Security Decision**: `nodeIntegration` remains `false`, so page script has no `require`. The preload itself is not sandboxed and shares the page's JavaScript world, which is why the controls below exist; they compensate for a missing boundary rather than restore it ([ADR-035](adr/035-renderer-trust-boundary.md)). Profile views use the same settings.

### Compensating Security Controls

#### 1. Content Security Policy

The application sets no Content Security Policy of its own for the Teams window. An earlier custom policy was never active and was removed. The page is governed by the policy Microsoft serves with Teams, and the application changes response headers in two cases only (`app/mainAppWindow/index.js`, `app/customBackground/index.js`):

- Report-only CSP headers are stripped from pages on non-Teams hosts, such as federated sign-in pages
- When custom backgrounds are configured, the configured service origin is added to `img-src` and `connect-src`

Treat Teams' own CSP as outside the application's control: it limits what injected script can load, but it is not a control this project maintains.

#### 2. IPC Channel Validation

**Implementation**: `app/security/ipcValidator.js`

**Features**:
- **Channel Allowlisting**: Only legitimate IPC channels are permitted
- **Payload Sanitization**: Removes the `__proto__`, `constructor` and `prototype` properties from the first argument of each message, recursing up to 10 levels deep; anything nested deeper, and any further arguments, are passed through as sent, so handlers still validate what they use
- **Request Validation**: Every `ipcMain.handle`, `on` and `once` registration is wrapped, so the allowlist and sender checks run before the handler
- **Sender Check on Every Channel**: `isSenderAllowed` reads the frame that sent each message (`event.senderFrame`, never `event.sender.getURL()`, which can already name the next page) and puts every allowlisted channel in one of three classes. `appPageOnlyChannels` (the screen-share picker, the profile channels, the Graph channels and the app's own dialogs, prompts and toasts) answer only a frame showing a file inside the app directory, so page script cannot capture the screen, pick a source, switch profiles, call the Graph API or answer a PIN prompt on its own. `anySenderChannels` is a short list pinned by a test, each entry with its reason in the code: `get-config`, `get-zoom-level`, `title-bar-overlay-update`, `webauthn:create` and `webauthn:get`. Every other channel answers the app's own pages and trusted web pages, meaning Teams, the Microsoft sign-in hosts, the configured URL and the `https` profile URLs (the predicate the permission handlers use, shared through `app/security/trustedPages.js`). A page on any other site, such as a federated sign-in page the window has been navigated to, is refused. A call with no event at all is an in-process `ipcMain.emit` and stays allowed
- **Quiet Refusals**: sign-in pages still run the preload's tools, so refusals are routine; the first one per channel is logged at `warn` with the channel and the sender's scheme only, and the rest are counted without logging
- **No Raw `ipcRenderer` in the Page**: With `contextIsolation: false`, anything `electronAPI` returns is usable by page script, so its listener helpers return nothing and strip Electron's IPC event (whose `sender` is the raw `ipcRenderer`) before calling back
- **Listener Errors Contained**: an exception or rejected promise from an `ipcMain.on` or `once` listener is logged and dropped by the wrapper in `app/security/ipcSecurity.js`, so a message with an unexpected shape cannot reach the process-wide error handlers that exit the app

```javascript
function validateIpcChannel(channel, payload = null) {
  if (!allowedChannels.has(channel)) {
    console.warn(`[IPC Security] Blocked unauthorized channel: ${channel}`);
    return false;
  }
  sanitizePayload(payload); // Recursive sanitization
  return true;
}
```

#### 3. Domain Validation

**Implementation**: `_isAllowedTeamsDomain` in `app/browser/tools/reactHandler.js`, and `isTeamsHost` in `app/helpers/teamsHosts.js`

The React handler acts only when the page's host is `teams.cloud.microsoft`, `teams.microsoft.com` or `teams.live.com`, an immediate subdomain of one of them, or its `.mcas.ms` (Defender for Cloud Apps) proxy name.

**Protection**: Keeps the handler from reading React internals on a page that is not Teams. The check runs inside the page's own JavaScript world, so it guards against acting on the wrong page, not against script already running in the Teams page.

#### 4. Screen Sharing Isolation

**Security Model**: The screen-sharing picker and preview windows set only a preload, so they keep Electron's defaults: context isolation on, sandbox on, no Node.js integration. They have no DOM access requirement.

#### 5. Process Error Handlers

**Implementation**: `app/index.js` (top-level)

**Features**:
- **`uncaughtException` handler**: Logs error details and exits with code 1 (process state unknown after uncaught exception)
- **`unhandledRejection` handler**: Logs rejection details; network errors are ignored, anything else exits with code 1, so every promise-returning Electron call (for example `shell.openExternal`) must be caught
- **Startup try/catch**: `handleAppReady()` wrapped with error logging and graceful `app.quit()` on failure

**Protection**: Prevents silent process termination and provides diagnostic output for crash reports.

#### 6. Input Sanitization for External Commands

**Implementation**: `app/mainAppWindow/browserWindowManager.js`

**Features**:
- **`sanitizeCommandArg()`**: Validates string type, limits length to 500 characters, strips control characters
- Applied to all incoming call notification arguments (`caller`, `text`, `image`) before passing to `spawn()`

**Protection**: Defense-in-depth against edge cases in user-configured notification commands receiving untrusted data from Teams messages.

#### 7. Webview Attach Blocked

**Implementation**: `app/security/webviewGuard.js`, `webviewTag: false` in `app/mainAppWindow/browserWindowManager.js` and `profileViewManager.js`

**Features**:
- **`webviewTag: false`**: Nothing in the app or in Teams web uses `<webview>`, so the tag is off in the root window and every profile view
- **App-wide `will-attach-webview` refusal**: Covers any webContents created later, including popups, since a guest can request its own preload with `sandbox=no` and that preload would run with full Node.js
- **Sticker import signature check**: `customStickers` URL import saves a file only when it starts with the declared image type's signature, rather than trusting the server's content-type header alone (a format sanity check; the webview block is the actual protection)

**Protection**: Keeps page script from turning a file on disk into code running with Node.js, which preserves the `nodeIntegration: false` boundary above.

#### 8. Preload Trust Boundary

**Implementation**: `app/browser/preload.js`, the browser tools under `app/browser/tools/`, `app/config/rendererConfig.js`; enforced by `tests/unit/preloadIpcLeak.test.js` and `tests/unit/preloadModules.test.js`

**Features**:
- **Init once, on the browser's event**: the `DOMContentLoaded` handler ignores synthetic events (`event.isTrusted`) and re-dispatches (module-level flag), so page script cannot make the preload hand out `ipcRenderer` a second time through patched built-ins
- **Indexed module loop**: the module list is walked by index over own properties, with every entry setting its own `ipc` flag, because `for...of`, `Set.has` and `Object.prototype` lookups are all patchable from the page
- **`ipcRenderer` in private fields under strict mode**: tools flagged `ipc: true` still receive the full `ipcRenderer` at init and keep it in `#private` fields; strict mode stops `EventEmitter`'s `this` (the raw `ipcRenderer`) from reaching sloppy-mode frames via V8's `CallSite.getThis`
- **No generic `electronAPI.send`**: the page gets named methods bound to fixed channels; the profile channels and all seven Graph channels are pinned to the app page, and profile URLs must be `https`
- **Credential-free renderer config**: `get-config` returns `toRendererConfig(config)`, without MQTT, basic-auth or client-certificate secrets

**Protection**: These rules are what keep script in the Teams window from recovering `ipcRenderer`, so it stays bounded to the named `electronAPI` methods with the preload's argument shaping, and it cannot read credentials (GHSA-58j7-22f8-6xqp). The world is still shared, so a preload change that breaks one of the rules can reopen a path; the two tests above exist to catch that.

#### 9. Session Permission Handlers

**Implementation**: `app/security/permissions.js`, installed on the default session and every profile partition

**Features**:
- **Trusted requesters get full access to device permissions**: Teams and government Teams hosts, the Microsoft sign-in hosts, the configured URL, `https` profile URLs and the app's own `file:` pages
- **External links are limited by scheme**: a trusted requester, and a link opened in a new window, may hand only `https`, `http`, `mailto`, `tel`, `sip`, `msteams` and `web+msteams` URLs to the operating system (`app/helpers/externalUrl.js`); other schemes are refused and logged by scheme only
- **Embedded frames keep only policy-gated permissions**: a cross-origin frame inside a trusted page (Whiteboard, Loop, SharePoint) may use media, display capture, clipboard and fullscreen, which Chromium already gates per frame with Permissions Policy, and nothing else
- **Other pages may only open mail and phone links**: any other permission from a popup, an in-app link or a page navigated to is denied
- **Denials logged once** per permission and origin, without the URL path

**Protection**: Without these handlers Electron grants every request, so a page opened in an app window could use the microphone or camera without a prompt (GHSA-58j7-22f8-6xqp, item 3).

#### 10. Navigation Lock

**Implementation**: `app/security/navigationGuard.js`, installed on the Teams window and on every multi-account profile view

**Features**:
- **Main-frame only**: it listens to `will-navigate` and `will-redirect` and ignores sub-frames. A server redirect inside a load the app started itself is covered by `will-redirect`
- **Trusted destinations**: the same trusted-page predicate as the IPC sender check, plus the origins in `urlHandling.navigationLock.extraOrigins` and `auth.webauthn.extraOrigins`, any page `auth.webLogin.extraHosts` accepts, `about:blank`, and a `blob:` URL whose inner origin is trusted. Anything unparseable is untrusted
- **Observe by default**: with `urlHandling.navigationLock.enabled` off (the default) nothing is blocked. The first navigation to each untrusted origin in a session is logged once at `info` with its scheme and whether it was a navigation or a redirect, and a hint names the option once
- **Block when enabled**: the navigation is cancelled, a `warn` is logged without the origin, and a non-blocking dialog names the origin on screen, once per origin and at most five per session, with how to allow it (add it to `urlHandling.navigationLock.extraOrigins` in `config.json` and restart)

**Protection**: The preload stays attached to whatever page the window shows, so a page the window has been sent to would otherwise keep the IPC reach the preload gives it. With the lock on, the window cannot leave the sites the user trusts. A cancelled redirect rejects the `loadURL()` that started it with `ERR_FAILED`, so every `loadURL` on these webContents handles its rejection: the process-wide `unhandledRejection` handler exits the app on anything it cannot classify.

**Limits**: the lock is off by default because a federated tenant's sign-in site cannot be known in advance, and blocking it would stop the user signing in until they add it. Popups from these windows are outside it: they get no preload, a sandbox and context isolation. Same-document navigations (`history.pushState`) fire neither event and do not change the page's origin.

## Recommended User-Level Security

### System-Level Sandboxing

The Teams window cannot use Electron's own isolation, so operating-system confinement is the layer that limits what a compromised renderer can reach. How much there is depends on the package:

| Package | Confinement | What it still grants |
|---------|-------------|----------------------|
| Flatpak (Flathub) | Flatpak sandbox | The home directory (`--filesystem=home`), all devices (`--device=all`) and the network, which file sharing, calls and screen sharing rely on. Flatseal or `flatpak override` can narrow this |
| Snap | Strict confinement | The home directory, removable media, camera, audio recording and the network, through the declared interfaces |
| deb, rpm, AppImage, tarball | None | Everything the user account can reach |
| macOS and Windows builds | None from this project | Everything the user account can reach |

For the unconfined packages, `firejail`, `bubblewrap` or an AppArmor or SELinux profile can add confinement. The project ships and tests none of these, so treat them as your own configuration.

## Local Control Surfaces

Some opt-in features let other software on the machine, or on the network, drive the application. They are off by default and worth understanding before enabling:

- **D-Bus control** (`dbusControl.enabled`, Linux): the service lives on the session bus with no per-caller access control, so any process in the user's session can call its methods (answer or decline a call, mute, leave, set presence) and read its signals (presence, call state, and the caller's identity when that is opted in). See [ADR-033](adr/033-dbus-control-api.md)
- **MQTT** (`mqtt.enabled`): anyone who can publish to the command topic can toggle the microphone, camera and raised hand, leave a call and, when the Graph API integration is enabled, request calendar data, which is then published to the broker. A `mqtt://` broker URL is cleartext, so use `mqtts://` for anything beyond localhost
- **Configured commands**: `auth.basic.passwordCommand`, `auth.webLogin.passwordCommand`, `incomingCallCommand` and `defaultURLHandler` run with the user's permissions

## Configuration Is Trusted

Configuration decides which commands run and which servers are trusted, so anyone who can change it can act as the user. It is read from the user's `config.json`, the system-wide `/etc/teams-for-linux/config.json` (defaults that the user file overrides), environment variables named after options, command-line flags, and `electronCLIFlags`, which passes arbitrary switches to Chromium. None of these is a policy-enforcement mechanism: a system-wide file sets defaults, it cannot lock a setting.

## Token Storage

Teams keeps its authentication tokens in the page's own storage (`localStorage` and IndexedDB) and in cookies, all inside the application's profile directory. The token cache bridge (`app/browser/tools/tokenCache.js`, [Token Cache Architecture](token-cache-architecture.md)) gives Teams the storage interface it expects and passes values through to `localStorage`; it adds no encryption of its own.

Two layers of encryption do apply, neither of them the bridge's. Teams' sign-in library (MSAL) encrypts some of its token entries in `localStorage` with a key held in the `msal.cache.encryption` cookie, which the application keeps across restarts (`app/mainAppWindow/msalCookiePersistence.js`). Packaged builds also enable Electron's cookie encryption, which protects the cookie store with a key from the operating system's keyring where one is available.

The entries and the means to decrypt them all belong to the same user account, so this guards against casual reading of the files, not against a process running as the user. Disk encryption and the security of the user account are what protect the tokens at rest.

The opt-in Graph API integration reuses the Teams session token rather than a separate app registration ([ADR-030](adr/030-graph-api-teams-session-token.md)), and its requests are made from the main process.

## Risk Assessment

### Residual Risk

The application's exposure is concentrated in one place: script running in the Teams window, through a script-injection flaw in Teams web or a page loaded in that window. Context isolation is off there, so what stands between such script and the rest of the system is the set of compensating controls above, not a process boundary. Three security advisories in October and November 2026 ([GHSA-3vg9-cwq9-p773](https://github.com/IsmaelMartinez/teams-for-linux/security/advisories/GHSA-3vg9-cwq9-p773), [GHSA-6xpg-fhf9-chcr](https://github.com/IsmaelMartinez/teams-for-linux/security/advisories/GHSA-6xpg-fhf9-chcr), [GHSA-58j7-22f8-6xqp](https://github.com/IsmaelMartinez/teams-for-linux/security/advisories/GHSA-58j7-22f8-6xqp)) were all in this area, and each led to one of those controls.

What the controls bound today:

- Page script reaches only the named `electronAPI` methods and the IPC channels behind them, with privileged channels answered only for the app's own pages and every other channel only for the app's pages and trusted web pages (five channels, listed above, answer any page)
- It cannot load a `<webview>`, read credentials from the configuration, or obtain device permissions for a page outside the trusted set
- Links it hands to the operating system are limited to web, mail, phone, SIP and Teams schemes

What remains open:

- A top-level navigation away from Teams keeps the preload attached to the new page unless the navigation lock (`urlHandling.navigationLock.enabled`) is on, which is off by default. A page on a foreign site still gets the credential-free `get-config` answer, and the preload's own tools run there. Section 10 and [ADR-035](adr/035-renderer-trust-boundary.md) describe what is and is not refused
- The controls depend on rules that every browser tool must keep following, so a regression is possible; the unit tests named above guard the known cases
- Everything depends on Teams web staying free of script injection, which this project does not control

On the local side, any process running as the user can read the profile directory, and the opt-in control surfaces above accept commands from other local software. Operating-system confinement varies by package, as the table above shows.

Taken together this is a moderate residual risk, accepted because the alternative (enabling context isolation) removes the features the application exists to provide.

### Continued Security Best Practices

**For Users**:
- Use official package repositories (Flatpak, Snap, distribution packages) when available
- Keep the application updated through your package manager
- Enable the D-Bus, MQTT and command options only when you use them

**For Developers**:
- Continue monitoring Teams web app changes that could affect security
- Maintain IPC channel validation and domain restrictions
- Follow the renderer rules in [ADR-035](adr/035-renderer-trust-boundary.md) for every new browser tool: strict mode, `ipcRenderer` in a private field, no Electron objects returned to the page, sender checks on new privileged channels
- Validate arguments in the main process, not only in the preload
- Keep dependencies updated and monitor security advisories

## Security Contact & Reporting

**Security Issues**: Report privately through [GitHub's private vulnerability reporting](https://github.com/IsmaelMartinez/teams-for-linux/security/advisories/new), as described in the repository's `SECURITY.md`
**Security Questions**: Open a GitHub issue
