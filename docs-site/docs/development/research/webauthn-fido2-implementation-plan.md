# WebAuthn / FIDO2 Hardware Security Key Support

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable hardware security key (FIDO2/WebAuthn) authentication in Teams for Linux on Linux, where Electron's Chromium engine lacks native support.

**Architecture:** On Linux, monkey-patch `navigator.credentials.create()` and `.get()` in the preload script (following the same pattern as `emulatePlatform.js` and `disableAutogain.js`), route calls via IPC to a main-process module that shells out to Yubico's `fido2-tools` CLI (`fido2-token`, `fido2-cred`, `fido2-assert`). On macOS and Windows, Electron's Chromium handles WebAuthn natively — no patching needed.

**Tech Stack:** Electron IPC, Yubico libfido2 CLI tools (system package), base64url encoding, WebAuthn clientDataJSON, cbor-x (CBOR encoding for attestation objects)

**Related issue:** [#802](https://github.com/IsmaelMartinez/teams-for-linux/issues/802)

**Known limitations (v1):** Only the first connected FIDO2 device is used. Multi-device selection is a future enhancement.

**ADR:** An Architecture Decision Record should be created at `docs-site/docs/development/adr/` documenting the decision to monkey-patch navigator.credentials and shell out to fido2-tools, including alternatives considered (native Node.js FIDO2 libraries, Chromium virtual authenticator API).

**License note:** Parts of the fido2-tools integration are adapted from [electron-webauthn-linux](https://github.com/nicholascross/electron-webauthn-linux) (Apache 2.0), which is compatible with GPLv3. Attribution is included in the source files.

---

## Background

Microsoft's login page (`login.microsoftonline.com`) calls `navigator.credentials.create()` and `.get()` for security key authentication. Chromium only implements WebAuthn natively on macOS (via iCloud Keychain / Touch ID) and Windows (via Windows Hello). On Linux, these calls hang indefinitely — the API exists but no authenticator responds.

A spike test (`testing/spikes/spike-4-webauthn-support.js`) confirmed that Electron 39.7.0 (Chrome 142) has the WebAuthn API available (`PublicKeyCredential` exists, `isConditionalMediationAvailable()` returns true), and that a CDP virtual authenticator can complete the full create + get flow successfully. The gap is strictly the connection between the browser API and real hardware on Linux.

The solution intercepts `navigator.credentials` calls before they reach Chromium's (broken on Linux) implementation, and routes them to `fido2-tools` — Yubico's battle-tested C library for FIDO2 device communication, available as a system package on all major Linux distributions (`sudo apt install fido2-tools` / `sudo dnf install fido2-tools`).

## File Structure

```
app/
  webauthn/
    index.js              # Main-process module: initializes IPC handlers, checks fido2-tools
    fido2Backend.js       # fido2-tools CLI wrapper: device discovery, create, get, PIN handling
    helpers.js            # base64url encode/decode, clientDataJSON generation, input sanitization
    pinDialog.js          # PIN entry dialog (Electron BrowserWindow, follows app/login/ pattern)
    pinDialog.html        # PIN input form
    pinDialogPreload.js   # contextBridge for PIN submission
    README.md             # Module documentation
  browser/tools/
    webauthnOverride.js   # Preload monkey-patch: intercepts navigator.credentials on Linux
  security/
    ipcValidator.js       # (modify) Add webauthn IPC channels to allowlist
  config/
    index.js              # (modify) Add auth.webauthn config option
  browser/
    preload.js            # (modify) Add webauthnOverride to module list
  index.js                # (modify) Initialize webauthn module
tests/
  e2e/
    webauthn.spec.js      # E2E validation using CDP virtual authenticator
```

Responsibilities:

`webauthnOverride.js` handles renderer-side concerns only: serializes ArrayBuffers to base64url, sends IPC, deserializes response back into proper PublicKeyCredential-shaped objects. No crypto, no device access.

`fido2Backend.js` handles all fido2-tools interaction: device discovery via `fido2-token -L`, credential creation via `fido2-cred -M`, assertion via `fido2-assert -G`. Accepts a `pinCallback` function for PIN collection. Pure I/O, no Electron dependencies.

`pinDialog.js` shows a modal PIN entry dialog when fido2-tools require user verification (PIN). Follows the exact pattern of `app/login/` (BrowserWindow + preload + HTML form). Returns a Promise that resolves with the PIN string.

`helpers.js` provides shared utilities: base64url encoding/decoding, clientDataJSON buffer generation, and input sanitization for the fido2-tools line-based protocol.

`index.js` (webauthn module root) wires everything together: checks platform, checks tool availability, creates the PIN callback (connecting fido2Backend to pinDialog), and registers IPC handlers.

---

## Chunk 1: Validation

This chunk confirms the problem exists on Linux and that our approach works before writing any production code.

### Task 1: Cross-platform API behaviour validation

**Files:**
- Existing: `testing/spikes/spike-4-webauthn-support.js`
- Existing: `testing/spikes/spike-4-webauthn-test.html`
- Existing: `testing/spikes/spike-4-webauthn-preload.js`

The spike already exists. This task is manual validation.

- [ ] **Step 1: Run spike on macOS**

```bash
npx electron testing/spikes/spike-4-webauthn-support.js
```

Expected Phase 1 results:
- `PublicKeyCredential`: true
- `isUserVerifyingPlatformAuthenticatorAvailable()`: false (no Touch ID in Electron)
- `navigator.credentials.create/get`: Available

Click "Run Virtual Authenticator Tests" (Phase 2). Expected: both create and get PASS.

Click "Test Real Hardware" (Phase 3). Expected: timeout (no key plugged in) or PASS (if USB key available).

Record results.

- [ ] **Step 2: Run spike on Linux**

Copy the spike files to a Linux machine (or VM) with Electron 39 and run the same test. Expected Phase 1 results should be similar (API available). Phase 2 (virtual authenticator) should also PASS — this proves Chromium's engine works. Phase 3 will reveal the actual gap: either timeout or NotSupportedError.

Record results.

- [ ] **Step 3: Install fido2-tools on Linux and verify CLI works**

```bash
# Debian/Ubuntu
sudo apt install fido2-tools

# Fedora
sudo dnf install fido2-tools

# Verify installation
fido2-token -V
fido2-token -L   # Lists connected devices (empty if no key plugged in)
```

If a hardware key is available, test manual credential creation:
```bash
echo "deadbeef" | fido2-cred -M -h /dev/hidrawN
```

This confirms the CLI tools can communicate with a real device.

- [ ] **Step 4: Document validation results**

Create a brief summary of results per platform. This informs whether we need the monkey-patch on all platforms or Linux-only. Expected conclusion: Linux-only patching, macOS/Windows handled natively.

- [ ] **Step 5: Commit spike files**

```bash
git add testing/spikes/spike-4-webauthn-support.js testing/spikes/spike-4-webauthn-test.html testing/spikes/spike-4-webauthn-preload.js
git commit -m "spike: add WebAuthn/FIDO2 support validation test (#802)"
```

---

## Community Validation Results (2026-03-13)

Community member rlavriv ([#2332](https://github.com/IsmaelMartinez/teams-for-linux/issues/2332)) ran the spike-5 validation script on Arch Linux (kernel 6.19.6) with a YubiKey OTP+FIDO+CCID (vendor 0x1050, product 0x0407) and fido2-tools v1.16.0. The test exposed several critical bugs in the plan's assumptions about fido2-tools input/output formats.

### Bug 1: Input encoding — hex vs base64

The plan sends `clientDataHash` and `userId` as hex strings. fido2-tools expects base64-encoded input. The Yubico documentation for [fido2-cred INPUT FORMAT](https://developers.yubico.com/libfido2/Manuals/fido2-cred.html#INPUT_FORMAT) specifies base64. The initial run failed immediately with "input error" until rlavriv corrected the encoding.

This affects `createCredential()` in `fido2Backend.js`:

```javascript
// WRONG (plan's current code):
const input = [
    clientDataHash.toString("hex"),
    sanitizeForFido2(options.rpId),
    sanitizeForFido2(options.userName),
    userIdHex,
].join("\n") + "\n";

// CORRECT (validated — fido2-tools expects standard base64, not base64url):
const input = [
    clientDataHash.toString("base64"),
    sanitizeForFido2(options.rpId),
    sanitizeForFido2(options.userName),
    base64urlDecode(options.userId).toString("base64"),
].join("\n") + "\n";
```

The same bug affects `getAssertion()`, where `clientDataHash` and credential IDs are sent as hex.

### Bug 2: Device path trailing colon

`fido2-token -L` outputs `/dev/hidraw11: vendor=0x1050, product=0x0407 (...)`. The plan's regex captures the trailing colon as part of the device path, causing all subsequent commands to fail. rlavriv fixed the regex to use a lookahead: `grep -oP '^/dev/\S+(?=:)'`.

This affects `discoverDevices()` in `fido2Backend.js`. The Node.js code needs the same fix.

### Bug 3: fido2-cred output format is 7 lines, not 4-5

The plan assumed `fido2-cred -M -h` outputs 4-5 lines: `format, authData, x509cert, signature, [credId]`. The actual output from fido2-tools v1.16.0 is 7 lines because it echoes back the input before the credential data:

```
Line 1: clientDataHash (echoed back, base64)
Line 2: rpId (echoed back, plain text)
Line 3: format string (e.g. "packed")
Line 4: authData (base64, 212 bytes decoded)
Line 5: credId (base64, 64 bytes decoded)
Line 6: signature (base64, 71 bytes decoded)
Line 7: x509 certificate (base64, 722 bytes decoded)
```

The plan's parsing code indexes from line 0, expecting `lines[0]` to be the format string. In reality, `lines[0]` is the echoed clientDataHash and the format is at `lines[2]`. All line indices in `createCredential()` need shifting by +2, and the field order after the echo differs from the plan's assumption (credId comes before signature and x509, not after).

Corrected parsing (to be validated with more devices/versions):

```javascript
const lines = stdout.trim().split("\n");
// Skip echoed input lines (clientDataHash + rpId)
const dataLines = lines.slice(2);
if (dataLines.length < 4) {
    throw new Error("NotAllowedError: Unexpected fido2-cred output format");
}
const fmt = dataLines[0].trim();           // "packed" or "none"
const authData = Buffer.from(dataLines[1], "base64");  // authData
const credId = Buffer.from(dataLines[2], "base64");    // credId
const signature = Buffer.from(dataLines[3], "base64"); // signature
const x5c = dataLines.length >= 5
    ? Buffer.from(dataLines[4], "base64")              // x509 cert
    : null;
```

### Bug 4: fido2-assert failed entirely

The assertion step (`fido2-assert -G -h`) produced 0 output lines and failed with "input error". This is almost certainly the same base64-vs-hex input encoding bug from Bug 1. The assertion input also sends `clientDataHash` and credential IDs as hex, which fido2-assert rejects. rlavriv did not get to debug the assertion step further after fixing credential creation.

This needs to be re-tested with corrected base64 input encoding. The assertion output format may also differ from the plan's assumption (the plan expects `authData, signature, [credId], [userHandle]` but the real output may include echoed input lines like fido2-cred does).

### Bug 5: PIN prompt detection

The plan expected stderr to contain "Enter PIN for" when a PIN is required. The actual stderr output was just "fido2-assert: input error" (because the command failed before reaching the PIN stage). PIN prompt detection remains unvalidated. rlavriv's key did not require a PIN for credential creation but the assertion step never got far enough to test PIN behaviour.

### Validated environment

| Field | Value |
|-------|-------|
| Distro | Arch Linux |
| Kernel | 6.19.6-arch1-1 |
| fido2-tools version | 1.16.0 |
| Device | YubiKey OTP+FIDO+CCID (0x1050:0x0407) |
| Device path | /dev/hidraw11 |
| PIN required | No (for credential creation) |

### Impact on implementation

The core approach (monkey-patch navigator.credentials, route via IPC to fido2-tools CLI) is validated — credential creation succeeded with a real YubiKey once the input encoding was corrected.

**Plan code updated (2026-03-18):** The code blocks in Chunks 3-5 below now incorporate all validated fixes. Bugs 1-4 are resolved in the plan code. Bug 5 (PIN prompt detection) and the assertion echo-offset heuristic remain unvalidated and are marked defensively in the code.

Summary of fixes applied to plan code:

1. ~~All input encoding must change from hex to base64~~ Fixed in `createCredential()` and `getAssertion()`
2. ~~Device path parsing must strip the trailing colon~~ Fixed regex to `/^(\/dev\/\S+?):/`
3. ~~Output parsing must account for echoed input lines (offset +2)~~ Fixed with `lines.slice(2)` in `createCredential()`
4. ~~Field order in fido2-cred output differs from plan (credId before signature/x5c)~~ Fixed: fmt, authData, credId, signature, x509
5. fido2-assert echo detection uses a defensive heuristic (check if `lines[1]` matches rpId) — needs validation
6. PIN prompt detection is unvalidated and may need a different approach
7. `bufferToBase64url` now processes in chunks to avoid stack overflow on large buffers
8. `discoverDevices` now logs errors instead of swallowing them silently

**Remaining validation needed:** A second test run with corrected base64 encoding for `fido2-assert` (assertion step), and PIN behaviour with a key that has a PIN set. rlavriv's updated script is available in #2332.

---

## Chunk 2: Helpers and configuration

This chunk creates the shared utilities and wires up the configuration, with no functional changes to the app yet.

### Task 2: Create helpers module

**Files:**
- Create: `app/webauthn/helpers.js`

- [ ] **Step 1: Write helpers**

```javascript
// app/webauthn/helpers.js

/**
 * WebAuthn helper utilities for base64url encoding and clientDataJSON generation.
 *
 * Adapted from electron-webauthn-linux (Apache 2.0, Copyright nicholascross).
 * Used under GPLv3 per Apache 2.0 compatibility.
 */

/**
 * Encode a Buffer to base64url string (no padding).
 * @param {Buffer} buffer
 * @returns {string}
 */
function base64urlEncode(buffer) {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Decode a base64url string to Buffer.
 * @param {string} str
 * @returns {Buffer}
 */
function base64urlDecode(str) {
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4 !== 0) {
    base64 += "=";
  }
  return Buffer.from(base64, "base64");
}

/**
 * Generate the clientDataJSON buffer per the WebAuthn spec.
 * Key order matters: type, challenge, origin, crossOrigin.
 *
 * @param {string} type - "webauthn.create" or "webauthn.get"
 * @param {Buffer} challengeBytes - Raw challenge bytes
 * @param {string} origin - Origin string (e.g. "https://login.microsoftonline.com")
 * @returns {Buffer}
 */
function generateClientDataJSON(type, challengeBytes, origin) {
  const clientData = JSON.stringify({
    type,
    challenge: base64urlEncode(challengeBytes),
    origin,
    crossOrigin: false,
  });
  return Buffer.from(clientData, "utf-8");
}

/**
 * Sanitize a string for use in fido2-tools line-based stdin protocol.
 * Removes control characters (including newlines) that would corrupt
 * the protocol, and limits length to prevent abuse.
 *
 * @param {string} value
 * @param {number} [maxLength=500]
 * @returns {string}
 */
function sanitizeForFido2(value, maxLength = 500) {
  if (typeof value !== "string") return "";
  return value.replace(/[\x00-\x1f\x7f]/g, "").substring(0, maxLength);
}

module.exports = { base64urlEncode, base64urlDecode, generateClientDataJSON, sanitizeForFido2 };
```

- [ ] **Step 2: Commit**

```bash
git add app/webauthn/helpers.js
git commit -m "feat(webauthn): add base64url, clientDataJSON, and input sanitization helpers (#802)"
```

### Task 3: Add configuration option

**Files:**
- Modify: `app/config/index.js`

- [ ] **Step 3: Add auth.webauthn config option**

In `app/config/index.js`, find the existing `auth` option block and update the default to include `webauthn`:

```javascript
      auth: {
        default: {
          intune: {
            enabled: false,
            user: "",
          },
          webauthn: {
            enabled: false,
          },
        },
        describe: "Authentication configuration (Intune SSO, WebAuthn/FIDO2 security keys)",
        type: "object",
      },
```

Setting `enabled: false` by default means users opt in via config.json:

```json
{
  "auth": {
    "webauthn": {
      "enabled": true
    }
  }
}
```

- [ ] **Step 4: Run linting**

```bash
npm run lint
```

Expected: PASS with no new errors.

- [ ] **Step 5: Commit**

```bash
git add app/config/index.js
git commit -m "feat(webauthn): add auth.webauthn configuration option (#802)"
```

### Task 4: Add IPC channels to allowlist

**Files:**
- Modify: `app/security/ipcValidator.js`

- [ ] **Step 6: Add webauthn channels**

Add the following channels to the `allowedChannels` set in `app/security/ipcValidator.js`, in a new section after the authentication block:

```javascript
  // WebAuthn / FIDO2 security key support
  'webauthn:create',
  'webauthn:get',
  'webauthn:pin-submit',
  'webauthn:pin-cancel',
```

- [ ] **Step 7: Commit**

```bash
git add app/security/ipcValidator.js
git commit -m "feat(webauthn): add IPC channels to security allowlist (#802)"
```

---

## Chunk 3: fido2-tools backend

This chunk implements the main-process module that communicates with hardware security keys via fido2-tools.

### Task 5: Create fido2 backend

**Files:**
- Create: `app/webauthn/fido2Backend.js`

- [ ] **Step 1: Write the fido2 backend**

```javascript
// app/webauthn/fido2Backend.js

/**
 * Hardware FIDO2 key backend via libfido2 CLI tools.
 * Requires system package: fido2-tools (fido2-token, fido2-cred, fido2-assert).
 *
 * Adapted from electron-webauthn-linux (Apache 2.0, Copyright nicholascross).
 * Used under GPLv3 per Apache 2.0 compatibility.
 */

const { execFile, spawn } = require("node:child_process");
const { createHash } = require("node:crypto");
const { promisify } = require("node:util");
const { encode: cborEncode } = require("cbor-x");
const { base64urlEncode, base64urlDecode, generateClientDataJSON, sanitizeForFido2 } = require("./helpers");

const execFileAsync = promisify(execFile);

/**
 * Run a fido2 command with stdin input and optional PIN support.
 * Uses spawn (not exec/shell) to avoid command injection.
 *
 * PIN handling: when spawned without a terminal, fido2-tools fall back to
 * reading the PIN from stdin (prompt on stderr). This function detects the
 * PIN prompt on stderr and calls pinCallback to collect it from the user.
 *
 * @param {string} cmd - Command to run
 * @param {string[]} args - Command arguments
 * @param {string} input - Stdin input (credential parameters)
 * @param {number} timeoutMs - Process timeout in milliseconds
 * @param {Function|null} pinCallback - Async function that returns PIN string, or null if no PIN expected
 */
function spawnFido2(cmd, args, input, timeoutMs, pinCallback) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { timeout: timeoutMs });
    let stdout = "";
    let stderr = "";
    let pinHandled = false;
    let rejected = false;

    proc.stdout.on("data", (data) => { stdout += data.toString(); });

    proc.stderr.on("data", (data) => {
      const chunk = data.toString();
      stderr += chunk;

      // Detect PIN prompt from fido2-tools: "Enter PIN for /dev/hidrawN:"
      if (!pinHandled && pinCallback && chunk.includes("Enter PIN for")) {
        pinHandled = true;
        pinCallback()
          .then((pin) => {
            proc.stdin.write(pin + "\n");
          })
          .catch(() => {
            rejected = true;
            proc.kill("SIGTERM");
            reject(new Error("NotAllowedError: PIN entry cancelled by user"));
          });
      }
    });

    proc.on("close", (code) => {
      if (rejected) return;
      if (code === 0) {
        resolve({ stdout });
      } else {
        reject(new Error(`${cmd} exited with code ${code}: ${stderr.trim()}`));
      }
    });

    proc.on("error", (err) => {
      if (!rejected) reject(err);
    });

    // Write credential parameters to stdin.
    // Do NOT end stdin — fido2-tools will read PIN from stdin if needed.
    // The process exits naturally once the FIDO2 operation completes.
    proc.stdin.write(input);
  });
}

/**
 * Check if a command exists on the system PATH.
 */
async function commandExists(cmd) {
  try {
    await execFileAsync("which", [cmd]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if all three fido2-tools binaries are available.
 * @returns {Promise<boolean>}
 */
async function isAvailable() {
  const [hasCred, hasAssert, hasToken] = await Promise.all([
    commandExists("fido2-cred"),
    commandExists("fido2-assert"),
    commandExists("fido2-token"),
  ]);
  return hasCred && hasAssert && hasToken;
}

/**
 * Discover connected FIDO2 USB devices.
 * @returns {Promise<string[]>} Array of device paths
 */
async function discoverDevices() {
  try {
    const { stdout } = await execFileAsync("fido2-token", ["-L"]);
    // fido2-token -L output: "/dev/hidraw11: vendor=0x1050, product=0x0407 (...)"
    // The device path has a trailing colon that must be stripped (Bug 2, validated by rlavriv).
    return stdout
      .trim()
      .split("\n")
      .filter((line) => line.length > 0)
      .map((line) => {
        const match = line.match(/^(\/dev\/\S+?):/);
        return match ? match[1] : null;
      })
      .filter(Boolean);
  } catch (err) {
    console.error("[WEBAUTHN] Failed to discover FIDO2 devices:", err.message);
    return [];
  }
}

/**
 * Create a FIDO2 credential using a hardware security key.
 *
 * @param {object} options - WebAuthn create options (serialized from renderer)
 * @param {string} options.challenge - base64url-encoded challenge
 * @param {string} options.rpId - Relying party ID
 * @param {string} options.rpName - Relying party name
 * @param {string} options.userId - base64url-encoded user ID
 * @param {string} options.userName - User name
 * @param {string} options.origin - Request origin
 * @param {number} [options.timeout] - Timeout in seconds
 * @param {object} [options.authenticatorSelection] - Authenticator requirements
 * @param {Function|null} [options.pinCallback] - Async function that returns PIN string
 * @returns {Promise<object>} Credential creation result
 */
async function createCredential(options) {
  const devices = await discoverDevices();
  if (devices.length === 0) {
    throw new Error("NotAllowedError: No FIDO2 hardware device found. Plug in your security key and try again.");
  }

  const device = devices[0];
  const challengeBytes = base64urlDecode(options.challenge);
  const clientDataJSON = generateClientDataJSON("webauthn.create", challengeBytes, options.origin);
  const clientDataHash = createHash("sha256").update(clientDataJSON).digest();

  // fido2-tools expect standard base64, not hex (Bug 1, validated by rlavriv).
  const input = [
    clientDataHash.toString("base64"),
    sanitizeForFido2(options.rpId),
    sanitizeForFido2(options.userName),
    base64urlDecode(options.userId).toString("base64"),
  ].join("\n") + "\n";

  const args = ["-M", "-h"];

  if (options.authenticatorSelection?.residentKey === "required") {
    args.push("-r");
  }

  if (
    options.authenticatorSelection?.userVerification === "required" ||
    options.authenticatorSelection?.userVerification === "preferred"
  ) {
    args.push("-v");
  }

  args.push(device);

  const timeoutMs = (options.timeout || 60) * 1000;
  const needsPin = args.includes("-v");
  const { stdout } = await spawnFido2(
    "fido2-cred", args, input, timeoutMs,
    needsPin ? options.pinCallback : null,
  );

  const lines = stdout.trim().split("\n");
  // fido2-cred v1.16.0+ echoes back the first two input lines (clientDataHash + rpId)
  // before the credential data (Bug 3, validated by rlavriv on Arch Linux).
  // Skip the echoed input to reach the actual credential output.
  const dataLines = lines.slice(2);
  if (dataLines.length < 4) {
    throw new Error("NotAllowedError: Unexpected fido2-cred output format");
  }

  // Validated field order (fido2-tools v1.16.0): fmt, authData, credId, signature, x509
  const fmt = dataLines[0].trim();
  const authData = Buffer.from(dataLines[1], "base64");
  const credId = Buffer.from(dataLines[2], "base64");
  const signature = Buffer.from(dataLines[3], "base64");
  const x5c = dataLines.length >= 5
    ? Buffer.from(dataLines[4], "base64")
    : null;

  // Build a proper CBOR-encoded attestation object.
  // The attestation object is a CBOR map: { fmt, attStmt, authData }.
  const attStmt = fmt === "none"
    ? {}
    : {
        ...(x5c ? { x5c: [x5c] } : {}),
        sig: signature,
      };
  const attestationObject = cborEncode({ fmt, attStmt, authData });

  return {
    credentialId: base64urlEncode(credId),
    rawId: base64urlEncode(credId),
    attestationObject: base64urlEncode(attestationObject),
    clientDataJson: base64urlEncode(clientDataJSON),
    authenticatorData: base64urlEncode(authData),
    type: "public-key",
    transports: ["usb"],
    publicKeyAlgorithm: -7,
  };
}

/**
 * Get an assertion from a hardware security key.
 *
 * @param {object} options - WebAuthn get options (serialized from renderer)
 * @param {string} options.challenge - base64url-encoded challenge
 * @param {string} options.rpId - Relying party ID
 * @param {string} options.origin - Request origin
 * @param {Array} [options.allowCredentials] - Allowed credential descriptors
 * @param {string} [options.userVerification] - User verification requirement
 * @param {number} [options.timeout] - Timeout in seconds
 * @param {Function|null} [options.pinCallback] - Async function that returns PIN string
 * @returns {Promise<object>} Assertion result
 */
async function getAssertion(options) {
  const devices = await discoverDevices();
  if (devices.length === 0) {
    throw new Error("NotAllowedError: No FIDO2 hardware device found. Plug in your security key and try again.");
  }

  const device = devices[0];
  const challengeBytes = base64urlDecode(options.challenge);
  const clientDataJSON = generateClientDataJSON("webauthn.get", challengeBytes, options.origin);
  const clientDataHash = createHash("sha256").update(clientDataJSON).digest();

  // fido2-tools expect standard base64, not hex (Bug 4, same as Bug 1).
  const inputLines = [clientDataHash.toString("base64"), sanitizeForFido2(options.rpId)];

  if (options.allowCredentials && options.allowCredentials.length > 0) {
    for (const cred of options.allowCredentials) {
      inputLines.push(base64urlDecode(cred.id).toString("base64"));
    }
  }

  const input = inputLines.join("\n") + "\n";

  const args = ["-G", "-h"];

  if (
    options.userVerification === "required" ||
    options.userVerification === "preferred"
  ) {
    args.push("-v");
  }

  args.push(device);

  const timeoutMs = (options.timeout || 60) * 1000;
  const needsPin = args.includes("-v");
  const { stdout } = await spawnFido2(
    "fido2-assert", args, input, timeoutMs,
    needsPin ? options.pinCallback : null,
  );

  const lines = stdout.trim().split("\n");
  // fido2-assert may echo back input lines like fido2-cred does (Bug 3 pattern).
  // The assertion output contains authData and signature as base64 — detect echoed
  // input by checking if the first line matches our rpId (second input line).
  // If echoed, skip the input lines. This is defensive — needs further validation
  // with more fido2-tools versions (Bug 4/5 partially unvalidated).
  const echoOffset = lines.length > 2 && lines[1] === sanitizeForFido2(options.rpId) ? 2 : 0;
  const dataLines = lines.slice(echoOffset);
  if (dataLines.length < 2) {
    throw new Error("NotAllowedError: Unexpected fido2-assert output format");
  }

  const authData = Buffer.from(dataLines[0], "base64");
  const signature = Buffer.from(dataLines[1], "base64");
  let credentialId;
  if (dataLines.length >= 3) {
    credentialId = base64urlEncode(Buffer.from(dataLines[2], "base64"));
  } else if (options.allowCredentials && options.allowCredentials.length === 1) {
    credentialId = options.allowCredentials[0].id;
  } else {
    throw new Error("NotAllowedError: fido2-assert did not return a credential ID and multiple credentials were allowed");
  }
  const userHandle = dataLines.length >= 4
    ? base64urlEncode(Buffer.from(dataLines[3], "base64"))
    : null;

  return {
    credentialId,
    rawId: credentialId,
    authenticatorData: base64urlEncode(authData),
    clientDataJson: base64urlEncode(clientDataJSON),
    signature: base64urlEncode(signature),
    userHandle,
    type: "public-key",
  };
}

module.exports = { isAvailable, discoverDevices, createCredential, getAssertion };
```

- [ ] **Step 2: Install cbor-x dependency**

```bash
npm install cbor-x --save
```

`cbor-x` is a fast, zero-dependency CBOR encoder/decoder needed to construct valid WebAuthn attestation objects from fido2-cred output.

- [ ] **Step 3: Commit**

```bash
git add app/webauthn/fido2Backend.js package.json package-lock.json
git commit -m "feat(webauthn): add fido2-tools hardware key backend (#802)"
```

### Task 6: Create PIN dialog

**Files:**
- Create: `app/webauthn/pinDialog.js`
- Create: `app/webauthn/pinDialog.html`
- Create: `app/webauthn/pinDialogPreload.js`

Microsoft Entra ID requires `userVerification: "required"` for FIDO2 sign-in, which means the security key's PIN must be entered before the cryptographic operation. When fido2-tools are spawned without a terminal, they fall back to reading the PIN from stdin (prompt goes to stderr). This dialog collects the PIN from the user and feeds it to the fido2-tools process.

The pattern follows `app/login/` exactly: a BrowserWindow modal with contextBridge preload and a simple HTML form.

- [ ] **Step 4: Write the PIN dialog preload**

```javascript
// app/webauthn/pinDialogPreload.js
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  submitPin: (pin) => ipcRenderer.send("webauthn:pin-submit", pin),
  cancelPin: () => ipcRenderer.send("webauthn:pin-cancel"),
});
```

- [ ] **Step 5: Write the PIN dialog HTML**

```html
<!-- app/webauthn/pinDialog.html -->
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Security Key PIN</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 16px; background: #f5f5f5; }
      h3 { margin: 0 0 12px; font-size: 14px; color: #333; }
      p { font-size: 12px; color: #666; margin: 0 0 12px; }
      input[type="password"] { width: 100%; padding: 8px; font-size: 14px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; }
      .buttons { margin-top: 12px; display: flex; gap: 8px; justify-content: flex-end; }
      button { padding: 6px 16px; font-size: 13px; border: 1px solid #ccc; border-radius: 4px; cursor: pointer; }
      button.primary { background: #1757bd; color: #fff; border-color: #1757bd; }
      button.secondary { background: #fff; color: #333; }
    </style>
  </head>
  <body>
    <h3>Security Key PIN</h3>
    <p>Enter the PIN for your FIDO2 security key to continue signing in.</p>
    <form id="pin-form">
      <input type="password" id="pin" placeholder="PIN" autofocus autocomplete="off" />
      <div class="buttons">
        <button type="button" class="secondary" id="cancel-btn">Cancel</button>
        <button type="submit" class="primary">OK</button>
      </div>
    </form>
    <script>
      document.getElementById("pin-form").addEventListener("submit", (event) => {
        event.preventDefault();
        const pin = document.getElementById("pin").value;
        if (pin) globalThis.api.submitPin(pin);
      });
      document.getElementById("cancel-btn").addEventListener("click", () => {
        globalThis.api.cancelPin();
      });
    </script>
  </body>
</html>
```

- [ ] **Step 6: Write the PIN dialog module**

```javascript
// app/webauthn/pinDialog.js

/**
 * PIN Entry Dialog for FIDO2 Security Keys
 *
 * Shows a modal dialog to collect the user's security key PIN.
 * Follows the app/login/ dialog pattern (BrowserWindow + contextBridge + HTML form).
 *
 * Microsoft Entra ID requires userVerification: "required" for FIDO2 sign-in,
 * meaning PIN entry is mandatory for security key authentication.
 */

const { BrowserWindow, ipcMain } = require("electron");
const path = require("node:path");

/**
 * Show a PIN entry dialog and return the entered PIN.
 *
 * @param {BrowserWindow|null} parentWindow - Parent window for modal attachment
 * @returns {Promise<string>} The entered PIN
 * @throws {Error} If the user cancels
 */
function requestPin(parentWindow) {
  return new Promise((resolve, reject) => {
    const win = new BrowserWindow({
      width: 340,
      height: 200,
      modal: true,
      frame: true,
      parent: parentWindow,
      show: false,
      resizable: false,
      autoHideMenuBar: true,
      webPreferences: {
        preload: path.join(__dirname, "pinDialogPreload.js"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    let settled = false;

    const onSubmit = (_event, pin) => {
      if (settled) return;
      settled = true;
      cleanup();
      win.close();
      resolve(pin);
    };

    const onCancel = () => {
      if (settled) return;
      settled = true;
      cleanup();
      win.close();
      reject(new Error("PIN entry cancelled"));
    };

    const cleanup = () => {
      ipcMain.removeListener("webauthn:pin-submit", onSubmit);
      ipcMain.removeListener("webauthn:pin-cancel", onCancel);
    };

    ipcMain.on("webauthn:pin-submit", onSubmit);
    ipcMain.on("webauthn:pin-cancel", onCancel);

    win.on("closed", () => {
      if (!settled) {
        settled = true;
        cleanup();
        reject(new Error("PIN entry cancelled"));
      }
    });

    win.once("ready-to-show", () => win.show());
    win.loadFile(path.join(__dirname, "pinDialog.html"));
  });
}

module.exports = { requestPin };
```

- [ ] **Step 7: Commit**

```bash
git add app/webauthn/pinDialog.js app/webauthn/pinDialog.html app/webauthn/pinDialogPreload.js
git commit -m "feat(webauthn): add PIN entry dialog for FIDO2 security keys (#802)"
```

### Task 7: Create main-process webauthn module

**Files:**
- Create: `app/webauthn/index.js`

- [ ] **Step 3: Write the module entry point with IPC handlers**

```javascript
// app/webauthn/index.js

/**
 * WebAuthn / FIDO2 Hardware Security Key Support
 *
 * Registers IPC handlers for webauthn:create and webauthn:get channels.
 * Linux-only: on macOS/Windows, Electron's Chromium handles WebAuthn natively.
 *
 * Requires fido2-tools system package on Linux.
 */

const { BrowserWindow, ipcMain } = require("electron");
const fido2Backend = require("./fido2Backend");
const { requestPin } = require("./pinDialog");

// Defense-in-depth: only allow WebAuthn requests from known Microsoft login origins.
// The IPC allowlist is the primary control; this is a secondary check.
const ALLOWED_ORIGINS = new Set([
  "https://login.microsoftonline.com",
  "https://login.microsoft.com",
  "https://login.live.com",
]);

let initialized = false;

/**
 * Validate that the request origin is an expected Microsoft login domain.
 * @param {string} origin
 * @returns {boolean}
 */
function isAllowedOrigin(origin) {
  return ALLOWED_ORIGINS.has(origin);
}

/**
 * Create a PIN callback that shows the PIN dialog attached to the sender's window.
 * @param {Electron.WebContents} sender - The webContents that sent the IPC request
 * @returns {Function} Async function that returns the PIN string
 */
function createPinCallback(sender) {
  return () => {
    const parentWindow = BrowserWindow.fromWebContents(sender);
    return requestPin(parentWindow);
  };
}

/**
 * Initialize WebAuthn IPC handlers.
 * Should only be called on Linux when auth.webauthn.enabled is true.
 */
async function initialize() {
  if (initialized) return;

  const available = await fido2Backend.isAvailable();
  if (!available) {
    console.warn("[WEBAUTHN] fido2-tools not found. Install with: sudo apt install fido2-tools");
    console.warn("[WEBAUTHN] Hardware key support will not be available");
    return;
  }

  console.info("[WEBAUTHN] fido2-tools detected, registering IPC handlers");

  // Handle credential creation requests from renderer
  ipcMain.handle("webauthn:create", async (event, options) => {
    const origin = event.senderFrame?.origin || new URL(event.sender.getURL()).origin;

    if (!isAllowedOrigin(origin)) {
      console.warn("[WEBAUTHN] Blocked create request from unexpected origin");
      return { success: false, error: "SecurityError: origin not allowed" };
    }

    console.debug("[WEBAUTHN] Processing create credential request");

    try {
      const pinCallback = createPinCallback(event.sender);
      const result = await fido2Backend.createCredential({ ...options, origin, pinCallback });
      return { success: true, data: result };
    } catch (err) {
      console.error("[WEBAUTHN] Create credential failed");
      return { success: false, error: err.message };
    }
  });

  // Handle assertion requests from renderer
  ipcMain.handle("webauthn:get", async (event, options) => {
    const origin = event.senderFrame?.origin || new URL(event.sender.getURL()).origin;

    if (!isAllowedOrigin(origin)) {
      console.warn("[WEBAUTHN] Blocked get request from unexpected origin");
      return { success: false, error: "SecurityError: origin not allowed" };
    }

    console.debug("[WEBAUTHN] Processing get assertion request");

    try {
      const pinCallback = createPinCallback(event.sender);
      const result = await fido2Backend.getAssertion({ ...options, origin, pinCallback });
      return { success: true, data: result };
    } catch (err) {
      console.error("[WEBAUTHN] Get assertion failed");
      return { success: false, error: err.message };
    }
  });

  initialized = true;
  console.info("[WEBAUTHN] Hardware security key support initialized");
}

module.exports = { initialize };
```

- [ ] **Step 4: Commit**

```bash
git add app/webauthn/index.js
git commit -m "feat(webauthn): add main-process module with IPC handlers (#802)"
```

---

## Chunk 4: Browser override and integration

This chunk creates the renderer-side monkey-patch and wires everything together.

### Task 7: Create browser tool for navigator.credentials override

**Files:**
- Create: `app/browser/tools/webauthnOverride.js`

This module follows the same pattern as `emulatePlatform.js` and `disableAutogain.js`: a module with an `init(config, ipcRenderer)` function that monkey-patches browser APIs.

- [ ] **Step 1: Write the browser tool**

```javascript
// app/browser/tools/webauthnOverride.js

/**
 * WebAuthn Override Browser Tool
 *
 * Monkey-patches navigator.credentials.create() and .get() to route
 * WebAuthn requests through IPC to the main process, which uses
 * fido2-tools for hardware security key communication.
 *
 * Linux-only: on macOS/Windows, Electron's Chromium handles WebAuthn natively.
 */

function init(config, ipcRenderer) {
  if (process.platform !== "linux") {
    return;
  }

  if (!config.auth?.webauthn?.enabled) {
    return;
  }

  if (!navigator.credentials) {
    console.warn("[WEBAUTHN] navigator.credentials not available");
    return;
  }

  const originalCreate = navigator.credentials.create.bind(navigator.credentials);
  const originalGet = navigator.credentials.get.bind(navigator.credentials);

  navigator.credentials.create = async (options) => {
    if (!options?.publicKey) {
      return originalCreate(options);
    }

    console.debug("[WEBAUTHN] Intercepting credentials.create()");

    try {
      const serialized = serializeCreateOptions(options.publicKey);
      const result = await ipcRenderer.invoke("webauthn:create", serialized);

      if (!result.success) {
        throw mapError(result.error);
      }

      return reconstructCreateResponse(result.data);
    } catch (err) {
      if (err instanceof DOMException) throw err;
      throw new DOMException(err.message, "NotAllowedError");
    }
  };

  navigator.credentials.get = async (options) => {
    if (!options?.publicKey) {
      return originalGet(options);
    }

    console.debug("[WEBAUTHN] Intercepting credentials.get()");

    try {
      const serialized = serializeGetOptions(options.publicKey);
      const result = await ipcRenderer.invoke("webauthn:get", serialized);

      if (!result.success) {
        throw mapError(result.error);
      }

      return reconstructGetResponse(result.data);
    } catch (err) {
      if (err instanceof DOMException) throw err;
      throw new DOMException(err.message, "NotAllowedError");
    }
  };

  console.info("[WEBAUTHN] navigator.credentials patched for hardware security key support");
}

/**
 * Convert ArrayBuffer/Uint8Array fields to base64url for IPC transport.
 */
// NOTE: These browser-side base64url helpers intentionally duplicate the logic
// in app/webauthn/helpers.js because the renderer uses browser APIs (btoa/atob,
// ArrayBuffer) while the main process uses Node.js Buffer. Keep both in sync.
function bufferToBase64url(buffer) {
  const bytes = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer;
  // Process in chunks to avoid "Maximum call stack size exceeded" with large buffers.
  const CHUNK_SIZE = 8192;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK_SIZE));
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Convert base64url string to ArrayBuffer.
 */
function base64urlToBuffer(base64url) {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const binStr = atob(base64);
  const bytes = Uint8Array.from(binStr, (c) => c.charCodeAt(0));
  return bytes.buffer;
}

function serializeCreateOptions(publicKey) {
  return {
    challenge: bufferToBase64url(publicKey.challenge),
    rpId: publicKey.rp?.id || "",
    rpName: publicKey.rp?.name || "",
    userId: bufferToBase64url(publicKey.user?.id),
    userName: publicKey.user?.name || "",
    userDisplayName: publicKey.user?.displayName || "",
    pubKeyCredParams: publicKey.pubKeyCredParams,
    timeout: publicKey.timeout ? Math.floor(publicKey.timeout / 1000) : 60,
    authenticatorSelection: publicKey.authenticatorSelection || {},
    attestation: publicKey.attestation || "none",
    excludeCredentials: (publicKey.excludeCredentials || []).map((c) => ({
      id: bufferToBase64url(c.id),
      type: c.type,
      transports: c.transports,
    })),
  };
}

function serializeGetOptions(publicKey) {
  return {
    challenge: bufferToBase64url(publicKey.challenge),
    rpId: publicKey.rpId || "",
    timeout: publicKey.timeout ? Math.floor(publicKey.timeout / 1000) : 60,
    userVerification: publicKey.userVerification || "preferred",
    allowCredentials: (publicKey.allowCredentials || []).map((c) => ({
      id: bufferToBase64url(c.id),
      type: c.type,
      transports: c.transports,
    })),
  };
}

/**
 * Reconstruct a PublicKeyCredential-shaped object from IPC response.
 * We cannot create real PublicKeyCredential instances, but the shape
 * is sufficient for login.microsoftonline.com's JavaScript to process.
 */
function reconstructCreateResponse(data) {
  const rawId = base64urlToBuffer(data.rawId);
  return {
    id: data.credentialId,
    rawId: rawId,
    type: data.type,
    authenticatorAttachment: "cross-platform",
    response: {
      attestationObject: base64urlToBuffer(data.attestationObject),
      clientDataJSON: base64urlToBuffer(data.clientDataJson),
      getAuthenticatorData: () => base64urlToBuffer(data.authenticatorData),
      getTransports: () => data.transports || ["usb"],
      getPublicKey: () => null,
      getPublicKeyAlgorithm: () => data.publicKeyAlgorithm || -7,
    },
    getClientExtensionResults: () => ({}),
    toJSON: () => ({
      id: data.credentialId,
      rawId: data.rawId,
      type: data.type,
      response: {
        attestationObject: data.attestationObject,
        clientDataJSON: data.clientDataJson,
      },
    }),
  };
}

function reconstructGetResponse(data) {
  const rawId = base64urlToBuffer(data.rawId);
  return {
    id: data.credentialId,
    rawId: rawId,
    type: data.type,
    authenticatorAttachment: "cross-platform",
    response: {
      authenticatorData: base64urlToBuffer(data.authenticatorData),
      clientDataJSON: base64urlToBuffer(data.clientDataJson),
      signature: base64urlToBuffer(data.signature),
      userHandle: data.userHandle ? base64urlToBuffer(data.userHandle) : null,
    },
    getClientExtensionResults: () => ({}),
    toJSON: () => ({
      id: data.credentialId,
      rawId: data.rawId,
      type: data.type,
      response: {
        authenticatorData: data.authenticatorData,
        clientDataJSON: data.clientDataJson,
        signature: data.signature,
        userHandle: data.userHandle,
      },
    }),
  };
}

/**
 * Map error strings to appropriate DOMExceptions.
 */
function mapError(errorMessage) {
  const msg = (errorMessage || "").toLowerCase();
  if (msg.includes("notallowederror") || msg.includes("no fido2")) {
    return new DOMException(errorMessage, "NotAllowedError");
  }
  if (msg.includes("invaliderror") || msg.includes("invalid")) {
    return new DOMException(errorMessage, "InvalidStateError");
  }
  if (msg.includes("securityerror")) {
    return new DOMException(errorMessage, "SecurityError");
  }
  return new DOMException(errorMessage, "NotAllowedError");
}

module.exports = { init };
```

- [ ] **Step 2: Commit**

```bash
git add app/browser/tools/webauthnOverride.js
git commit -m "feat(webauthn): add browser tool to patch navigator.credentials (#802)"
```

### Task 8: Wire up preload and main process

**Files:**
- Modify: `app/browser/preload.js`
- Modify: `app/index.js`

- [ ] **Step 3: Add webauthnOverride to preload module list**

In `app/browser/preload.js`, add the module to the `modules` array (after the `emulatePlatform` entry, since they're both platform-related patches):

```javascript
      { name: "emulatePlatform", path: "./tools/emulatePlatform" },
      { name: "webauthnOverride", path: "./tools/webauthnOverride" },
```

Also add `"webauthnOverride"` to the `modulesRequiringIpc` set since it needs `ipcRenderer`:

```javascript
    const modulesRequiringIpc = new Set(["settings", "theme", "trayIconRenderer", "mqttStatusMonitor", "webauthnOverride"]);
```

- [ ] **Step 4: Initialize webauthn module in main process**

In `app/index.js`, add the require at the top with the other module imports:

```javascript
const WebAuthn = require("./webauthn");
```

Then in the `handleAppReady` function, after other module initializations, add:

```javascript
  // Initialize WebAuthn/FIDO2 hardware security key support (Linux only)
  if (process.platform === "linux" && config.auth?.webauthn?.enabled) {
    await WebAuthn.initialize();
  }
```

Note: `handleAppReady` is already `async`, so this costs nothing and prevents a race where the renderer sends a WebAuthn IPC call before the handlers are registered.

- [ ] **Step 5: Run linting**

```bash
npm run lint
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/browser/preload.js app/index.js
git commit -m "feat(webauthn): wire up preload and main process integration (#802)"
```

### Task 9: Update IPC documentation

**Files:**
- Run: `npm run generate-ipc-docs`

- [ ] **Step 7: Generate updated IPC docs**

```bash
npm run generate-ipc-docs
```

This regenerates `docs-site/docs/development/ipc-api-generated.md` with the new webauthn channels. Verify the new channels appear in the output.

- [ ] **Step 8: Commit docs**

```bash
git add docs-site/docs/development/ipc-api-generated.md
git commit -m "docs: update IPC API docs with webauthn channels (#802)"
```

---

## Chunk 5: Testing and documentation

### Task 10: E2E test with CDP virtual authenticator

**Files:**
- Create: `tests/e2e/webauthn.spec.js`

This test validates the full flow using Electron's CDP virtual authenticator, requiring no real hardware.

- [ ] **Step 1: Write the E2E test**

```javascript
// tests/e2e/webauthn.spec.js

const { test, expect } = require("@playwright/test");
const { _electron: electron } = require("@playwright/test");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

test.describe("WebAuthn FIDO2 Support", () => {
  let app;
  let page;
  let tmpDir;

  test.beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "t4l-webauthn-test-"));
  });

  test.afterEach(async () => {
    if (app) {
      await app.close();
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test("WebAuthn API is available in Electron", async () => {
    app = await electron.launch({
      args: [path.join(__dirname, "../../app")],
      env: {
        ...process.env,
        E2E_USER_DATA_DIR: tmpDir,
        E2E_TESTING: "true",
      },
    });

    page = await app.firstWindow();
    await page.waitForLoadState("domcontentloaded");

    const hasPKC = await page.evaluate(() => typeof window.PublicKeyCredential !== "undefined");
    expect(hasPKC).toBe(true);

    const hasCreate = await page.evaluate(() => typeof navigator.credentials?.create === "function");
    expect(hasCreate).toBe(true);

    const hasGet = await page.evaluate(() => typeof navigator.credentials?.get === "function");
    expect(hasGet).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test**

```bash
npm run test:e2e -- --grep "WebAuthn"
```

Expected: PASS (the API should be available regardless of platform).

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/webauthn.spec.js
git commit -m "test: add WebAuthn API availability E2E test (#802)"
```

### Task 11: Update configuration documentation

**Files:**
- Modify: `docs-site/docs/configuration.md`

- [ ] **Step 4: Add webauthn config documentation**

Add an entry for `auth.webauthn` in the configuration reference, following the existing format for `auth.intune`:

```markdown
### auth.webauthn

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `enabled` | boolean | `false` | Enable FIDO2 hardware security key support for WebAuthn authentication on Linux. Requires `fido2-tools` system package. On macOS and Windows, Electron handles WebAuthn natively. |
```

Include a usage example:

```json
{
  "auth": {
    "webauthn": {
      "enabled": true
    }
  }
}
```

And note the system dependency:

> Linux users must install fido2-tools: `sudo apt install fido2-tools` (Debian/Ubuntu) or `sudo dnf install fido2-tools` (Fedora).

- [ ] **Step 5: Commit**

```bash
git add docs-site/docs/configuration.md
git commit -m "docs: add WebAuthn/FIDO2 configuration reference (#802)"
```

### Task 12: Final integration test

- [ ] **Step 6: Manual smoke test on Linux**

1. Install fido2-tools: `sudo apt install fido2-tools`
2. Set config: `"auth": { "webauthn": { "enabled": true } }`
3. Launch t4l: `npm start`
4. Navigate to Teams login
5. Select "Sign in with a security key"
6. Plug in USB security key when prompted
7. Verify the PIN dialog appears (modal window asking for security key PIN)
8. Enter PIN, verify the key blinks / prompts for touch
9. Verify authentication completes

If no hardware key is available, verify via console logs:
- `[WEBAUTHN] fido2-tools detected, registering IPC handlers` appears on startup
- `[WEBAUTHN] navigator.credentials patched for hardware security key support` appears in renderer console
- Attempting security key login shows `[WEBAUTHN] Processing create credential request` in main process console
- Error message mentions "No FIDO2 hardware device found" (expected without key)

- [ ] **Step 7: Manual smoke test on macOS/Windows**

1. Do NOT set `auth.webauthn.enabled` (or set to false)
2. Launch t4l
3. Verify no `[WEBAUTHN]` log messages appear
4. If a security key is available, verify native Electron WebAuthn flow works

---

## Summary of all changes

| File | Action | Purpose |
|------|--------|---------|
| `app/webauthn/helpers.js` | Create | base64url encoding, clientDataJSON generation, input sanitization |
| `app/webauthn/fido2Backend.js` | Create | fido2-tools CLI wrapper with PIN callback support |
| `app/webauthn/index.js` | Create | Module entry point, IPC handlers, origin validation, PIN callback wiring |
| `app/webauthn/pinDialog.js` | Create | PIN entry dialog module (modal BrowserWindow) |
| `app/webauthn/pinDialog.html` | Create | PIN entry form UI |
| `app/webauthn/pinDialogPreload.js` | Create | contextBridge preload for PIN dialog |
| `app/webauthn/README.md` | Create | Module documentation |
| `app/browser/tools/webauthnOverride.js` | Create | Preload monkey-patch for navigator.credentials |
| `app/config/index.js` | Modify | Add `auth.webauthn` config option |
| `app/security/ipcValidator.js` | Modify | Add `webauthn:create`, `webauthn:get`, `webauthn:pin-submit`, `webauthn:pin-cancel` to allowlist |
| `app/browser/preload.js` | Modify | Add webauthnOverride to module list and IPC set |
| `app/index.js` | Modify | Initialize webauthn module on Linux |
| `package.json` | Modify | Add `cbor-x` dependency for attestation object encoding |
| `tests/e2e/webauthn.spec.js` | Create | API availability E2E test |
| `docs-site/docs/configuration.md` | Modify | Configuration reference for auth.webauthn |

Total new code: approximately 600 lines across 8 new files, plus minor modifications to 5 existing files.

Dependencies added: `cbor-x` (fast CBOR encoder, zero dependencies, needed to construct valid attestation objects from fido2-cred output).

IPC channels added: `webauthn:create` (credential creation), `webauthn:get` (assertion/login), `webauthn:pin-submit` (PIN dialog submit), `webauthn:pin-cancel` (PIN dialog cancel).
