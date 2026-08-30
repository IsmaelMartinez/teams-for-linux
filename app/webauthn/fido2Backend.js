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
const { encode: cborEncode, decode: cborDecode } = require("cbor-x");
const { base64urlEncode, base64urlDecode, generateClientDataJSON, sanitizeForFido2 } = require("./helpers");
const log = require("./log");

const execFileAsync = promisify(execFile);

/**
 * Rejection message used when the user cancels a security-key operation.
 * Callers compare against this to tell a deliberate cancel apart from a real
 * failure, so that a cancel is not reported to the page as a broken key.
 */
const CANCELLED_MESSAGE = "NotAllowedError: security key operation cancelled";

/**
 * Reject a cancelled request before it does any further work.
 * @param {AbortSignal} [signal]
 */
function throwIfCancelled(signal) {
  if (signal?.aborted) throw new Error(CANCELLED_MESSAGE);
}

// Silent probes answer in milliseconds; the cap only matters for a key that
// stalls on "-t up=false" instead of rejecting it, where the worst case is
// the old behaviour plus this long per listed credential.
const PROBE_TIMEOUT_MS = 5000;

/**
 * Run a fido2 command with stdin input and optional PIN.
 * Uses spawn (not exec/shell) to avoid command injection.
 *
 * PIN handling: fido2-tools use readpassphrase() which tries /dev/tty first.
 * To force stdin-based PIN input, the child is spawned detached (setsid on
 * Linux) so open("/dev/tty") fails and readpassphrase falls back to stdin.
 *
 * PIN handling: credential parameters are written to stdin first, then we
 * monitor stderr for the "Enter PIN for" prompt. Only when that prompt
 * appears do we write the pre-collected PIN. This avoids the race condition
 * of writing PIN too early (which caused "invalid PIN length" errors).
 *
 * @param {string} cmd - Command to run
 * @param {string[]} args - Command arguments (device should already be included)
 * @param {string[]} inputLines - Stdin input lines (credential parameters)
 * @param {number} timeoutMs - Process timeout in milliseconds
 * @param {string|null} pin - Pre-collected PIN string, or null if no PIN needed
 * @param {AbortSignal} [signal] - Aborting kills the child and rejects with CANCELLED_MESSAGE
 */
function spawnFido2(cmd, args, inputLines, timeoutMs, pin, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error(CANCELLED_MESSAGE));
      return;
    }

    // Detach the child process so it has no controlling terminal.
    // fido2-tools use readpassphrase() which tries /dev/tty first for PIN
    // input. With detached: true, open("/dev/tty") fails and the tool
    // falls back to reading PIN from stdin, where we pipe it.
    const proc = spawn(cmd, args, {
      detached: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let rejected = false;
    let pinWritten = false;
    // 'exit' fires before 'close', so a cancel or timeout landing in between
    // would otherwise discard a result the child has already produced — and
    // signal a PID the OS is free to have reused.
    let exited = false;
    proc.on("exit", () => {
      exited = true;
    });

    // The child sits in the user-presence check until the key is touched, so
    // both the timeout and an explicit cancel have to take the whole process
    // group down (negative PID) — detached: true put it in its own session,
    // and killing only the leader would orphan it holding the device open.
    const killProcessGroup = () => {
      try { process.kill(-proc.pid, "SIGKILL"); } catch { proc.kill("SIGKILL"); }
    };

    const timeout = setTimeout(() => {
      if (!rejected && !exited) {
        rejected = true;
        killProcessGroup();
        reject(new Error(`${cmd} timed out after ${timeoutMs}ms`));
      }
    }, timeoutMs);

    const onAbort = () => {
      // Let an already-finished call report its real result.
      if (rejected || exited) return;
      rejected = true;
      clearTimeout(timeout);
      killProcessGroup();
      log.info("[WEBAUTHN] Security key operation cancelled by user");
      reject(new Error(CANCELLED_MESSAGE));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    const stopListeningForAbort = () => signal?.removeEventListener("abort", onAbort);

    // Writing into a child that is already gone gives EPIPE on the stream.
    // Without a listener Node promotes that to an uncaught exception, and the
    // handler in app/index.js does not recognise it as recoverable, so it takes
    // the whole app down (#2920). The real outcome is decided by 'close' and
    // 'error' below, so this only has to keep the failed write from throwing.
    // Warn rather than debug: log.debug is off unless auth.webauthn.debug is
    // set, and a failed parameter write means the tool never received its
    // input, whose only other symptom is the full timeout a minute later.
    proc.stdin.on("error", (err) => {
      log.warn("[WEBAUTHN] stdin write failed", { errCode: err.code });
    });

    proc.stdout.on("data", (data) => { stdout += data.toString(); });

    proc.stderr.on("data", (data) => {
      const chunk = data.toString();
      stderr += chunk;

      // Detect the PIN prompt: "Enter PIN for /dev/hidrawN:"
      // Only when the tool is ready for PIN input do we write it.
      if (!pinWritten && pin && chunk.includes("Enter PIN for")) {
        pinWritten = true;
        log.info("[WEBAUTHN] PIN prompt detected, writing PIN");
        proc.stdin.write(pin.trim() + "\n");
        proc.stdin.end();
      }
    });

    proc.on("close", (code) => {
      clearTimeout(timeout);
      stopListeningForAbort();
      if (rejected) return;
      if (code === 0) {
        resolve({ stdout });
      } else {
        reject(new Error(`${cmd} exited with code ${code}: ${stderr.trim()}`));
      }
    });

    proc.on("error", (err) => {
      clearTimeout(timeout);
      stopListeningForAbort();
      if (!rejected) reject(err);
    });

    // Write credential parameters to stdin. Do NOT close stdin yet —
    // fido2-tools will prompt for PIN on stderr when ready, and we
    // write the PIN then (see stderr handler above).
    const paramBlock = inputLines.join("\n") + "\n";
    proc.stdin.write(paramBlock);

    // If no PIN is needed, close stdin so the tool doesn't hang waiting.
    if (!pin) {
      proc.stdin.end();
    }
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
    // The device path has a trailing colon that must be stripped (validated by rlavriv).
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
    log.error("[WEBAUTHN] Failed to discover FIDO2 devices", { errClass: log.classifyError(err) });
    return [];
  }
}

/**
 * Resolve the first connected FIDO2 device, or throw.
 * v1 limitation: only the first device is used. Multi-device selection is a future enhancement.
 * @returns {Promise<string>} Device path
 */
async function resolveDevice() {
  const devices = await discoverDevices();
  if (devices.length === 0) {
    throw new Error("NotAllowedError: No FIDO2 hardware device found. Plug in your security key and try again.");
  }
  return devices[0];
}

/**
 * Map a COSE algorithm number to fido2-cred type string.
 * @param {number} alg - COSE algorithm identifier
 * @returns {string|null} fido2-tools type string or null if unsupported
 */
function coseAlgToFido2Type(alg) {
  const map = { [-7]: "es256", [-35]: "es384", [-257]: "rs256", [-8]: "eddsa" };
  return map[alg] || null;
}

/**
 * Prepare clientDataJSON and its SHA-256 hash from challenge and origin.
 * @param {string} type - "webauthn.create" or "webauthn.get"
 * @param {string} challenge - base64url-encoded challenge
 * @param {string} origin - Request origin
 * @param {string|null} [topOrigin] - Top-level origin for an iframe ceremony
 * @returns {{ clientDataJSON: Buffer, clientDataHash: Buffer }}
 */
function prepareClientData(type, challenge, origin, topOrigin = null) {
  const challengeBytes = base64urlDecode(challenge);
  const clientDataJSON = generateClientDataJSON(type, challengeBytes, origin, topOrigin);
  const clientDataHash = createHash("sha256").update(clientDataJSON).digest();
  return { clientDataJSON, clientDataHash };
}

/**
 * Select the best supported algorithm from pubKeyCredParams and add the -t flag.
 * Returns the chosen COSE algorithm number, or -7 (ES256) if none specified.
 * Throws NotSupportedError if params are provided but none are supported.
 *
 * @param {Array|undefined} pubKeyCredParams
 * @param {string[]} args - fido2-cred args to push -t into
 * @returns {number} COSE algorithm identifier
 */
function selectAlgorithm(pubKeyCredParams, args) {
  if (!pubKeyCredParams || pubKeyCredParams.length === 0) {
    return -7; // default ES256
  }
  for (const param of pubKeyCredParams) {
    const fido2Type = coseAlgToFido2Type(param.alg);
    if (fido2Type) {
      args.push("-t", fido2Type);
      return param.alg;
    }
  }
  throw new Error("NotSupportedError: No supported public-key algorithm in pubKeyCredParams");
}

/**
 * Build fido2-cred args from authenticator selection options.
 * @param {object|undefined} authSel - authenticatorSelection from WebAuthn options
 * @returns {string[]} args array
 */
function buildCredArgs(authSel) {
  const args = ["-M", "-h"];
  if (authSel?.residentKey === "required") {
    args.push("-r");
  }
  // Only add -v for "required" per WebAuthn spec; "preferred" should not force UV.
  if (authSel?.userVerification === "required") {
    args.push("-v");
  }
  return args;
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
 * @param {Array} [options.pubKeyCredParams] - Allowed algorithms
 * @param {Function|null} [options.pinCallback] - Async function that returns PIN string
 * @returns {Promise<object>} Credential creation result
 */
async function createCredential(options) {
  // Bail out before touching the device: the prompt's Cancel can land while
  // the previous step is still settling, and enumerating USB hardware for a
  // request the user already gave up on is pure latency.
  throwIfCancelled(options.abortSignal);
  const device = await resolveDevice();
  log.info("[WEBAUTHN] createCredential", {
    devicePresent: true,
    uv: options.authenticatorSelection?.userVerification || "preferred",
    attestation: options.attestation || "none",
  });

  const { clientDataJSON, clientDataHash } = prepareClientData("webauthn.create", options.challenge, options.origin, options.topOrigin);

  // fido2-tools expect standard base64, not hex (validated by rlavriv).
  const inputLines = [
    clientDataHash.toString("base64"),
    sanitizeForFido2(options.rpId),
    sanitizeForFido2(options.userName),
    base64urlDecode(options.userId).toString("base64"),
  ];

  const args = buildCredArgs(options.authenticatorSelection);
  const chosenAlg = selectAlgorithm(options.pubKeyCredParams, args);
  args.push(device);

  const timeoutMs = (options.timeout || 60) * 1000;
  const { stdout } = await spawnFido2(
    "fido2-cred", args, inputLines, timeoutMs,
    options.preCollectedPin || null, options.abortSignal,
  );

  const lines = stdout.trim().split("\n");
  // fido2-cred v1.16.0+ echoes back the first two input lines (clientDataHash + rpId)
  // before the credential data (validated by rlavriv on Arch Linux).
  // Detect echoed input by checking if the second line matches rpId.
  const echoOffset = lines.length > 2 && lines[1] === sanitizeForFido2(options.rpId) ? 2 : 0;
  const dataLines = lines.slice(echoOffset);
  if (dataLines.length < 4) {
    throw new Error(`NotAllowedError: Unexpected fido2-cred output format. Expected at least 4 data lines, got ${dataLines.length}.`);
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
      ...(fmt === "packed" ? { alg: chosenAlg } : {}),
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
    publicKeyAlgorithm: chosenAlg,
  };
}

/**
 * Silently check whether a credential is present on the device.
 * "-t up=false" turns off the user-presence test, so the key answers without
 * a touch and, since UV is not requested, without a PIN. The assertion it
 * returns is unusable for sign-in (no UP flag) and is discarded; only the
 * exit status matters. Keys that refuse silent assertions fail every probe,
 * which reads as "no match" and leaves the caller on the sequential path.
 *
 * @param {string} device - Device path
 * @param {string[]} inputLines - clientDataHash, rpId and credentialId lines
 * @param {AbortSignal} [abortSignal] - Cancelling rejects instead of reporting a miss
 * @returns {Promise<boolean>} Whether the credential is on the device
 */
async function probeCredential(device, inputLines, abortSignal) {
  try {
    await spawnFido2("fido2-assert", ["-G", "-t", "up=false", device], inputLines, PROBE_TIMEOUT_MS, null, abortSignal);
    return true;
  } catch (err) {
    const errClass = log.classifyError(err);
    // A cancel is the user giving up on the ceremony, not a probe miss.
    if (errClass === "CANCELLED") throw err;
    log.debug("[WEBAUTHN] probe miss", { errClass });
    return false;
  }
}

/**
 * Narrow an allowCredentials list to the one credential the device holds,
 * using silent probes. A full assertion demands a touch per attempted
 * credential, so without narrowing a login page that lists several
 * registered credentials asks the user for one blind touch per entry.
 * Probing first means the real assertion needs exactly one touch.
 *
 * Returns the original list when nothing probes as present (credProtect can
 * hide credentials from silent probes), so the sequential behaviour stays
 * as the fallback and probing can only remove touches, never break a login.
 *
 * @param {Array} allowCredentials - Credential descriptors from the RP
 * @param {(cred: object) => Promise<boolean>} probe - Presence check for one credential
 * @returns {Promise<Array>} Either [matchedCredential] or the original list
 */
async function narrowCandidates(allowCredentials, probe) {
  if (allowCredentials.length <= 1) {
    return allowCredentials;
  }
  const total = allowCredentials.length;
  for (const [i, cred] of allowCredentials.entries()) {
    log.debug("[WEBAUTHN] getAssertion probe", { index: i + 1, total });
    if (await probe(cred)) {
      log.info("[WEBAUTHN] getAssertion probe matched", { index: i + 1, total });
      return [cred];
    }
  }
  log.info("[WEBAUTHN] getAssertion probes found no match, using sequential fallback", { total });
  return allowCredentials;
}

/**
 * Try each credential the relying party allowed, until one is on the key.
 *
 * The server lists every credential it has registered for the account, but only
 * one of them lives on the key that is plugged in (marcovr's bug: the first
 * credential is not necessarily the right one). FIDO_ERR_NO_CREDENTIALS is the
 * device saying "not this one"; every other outcome — a cancel, a bad PIN, a
 * timeout — is final and stops the loop rather than being retried against the
 * remaining credentials.
 *
 * Lives outside getAssertion() so the retry decision is not three levels deep
 * (SonarCloud javascript:S3776).
 *
 * @param {object} options - Same options object getAssertion received
 * @param {string[]} args - fido2-assert args, device included
 * @param {string[]} inputLines - Stdin lines shared by every attempt
 * @param {number} timeoutMs - Per-attempt timeout
 * @param {Buffer} clientDataJSON - clientDataJSON for the result
 * @returns {Promise<object>} Assertion result
 */
async function tryAllowCredentials(options, args, inputLines, timeoutMs, clientDataJSON) {
  const total = options.allowCredentials.length;
  let lastError;

  for (const [i, cred] of options.allowCredentials.entries()) {
    const credInputLines = [...inputLines, base64urlDecode(cred.id).toString("base64")];
    const index = i + 1;
    log.debug("[WEBAUTHN] getAssertion cred-try", { index, total });
    try {
      const { stdout } = await spawnFido2(
        "fido2-assert", args, credInputLines, timeoutMs,
        options.preCollectedPin || null, options.abortSignal,
      );
      return parseAssertionOutput(stdout, options, clientDataJSON, cred.id);
    } catch (err) {
      const errClass = log.classifyError(err);
      log.debug("[WEBAUTHN] getAssertion cred-try failed", { index, total, errClass });
      lastError = err;
      // Only "this credential is not on this device" is worth another attempt.
      if (errClass !== "NO_CREDENTIALS") throw err;
    }
  }

  throw lastError;
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
  // Bail out before touching the device: the prompt's Cancel can land while
  // the previous step is still settling, and enumerating USB hardware for a
  // request the user already gave up on is pure latency.
  throwIfCancelled(options.abortSignal);
  const device = await resolveDevice();
  log.info("[WEBAUTHN] getAssertion", {
    devicePresent: true,
    uv: options.userVerification || "preferred",
    credCount: options.allowCredentials?.length || 0,
  });

  const { clientDataJSON, clientDataHash } = prepareClientData("webauthn.get", options.challenge, options.origin, options.topOrigin);

  // fido2-tools expect standard base64, not hex (same as createCredential).
  const inputLines = [clientDataHash.toString("base64"), sanitizeForFido2(options.rpId)];

  const hasAllowCredentials = options.allowCredentials && options.allowCredentials.length > 0;

  const args = ["-G"];

  // -r (resident/discoverable) is only needed when the server doesn't specify
  // which credentials to use. When allowCredentials is provided, the server
  // has selected specific credentials — don't use -r or it conflicts.
  if (!hasAllowCredentials) {
    args.push("-r");
  }

  // Only add -v for "required" per WebAuthn spec; "preferred" should not force UV.
  if (options.userVerification === "required") {
    args.push("-v");
  }

  args.push(device);

  const timeoutMs = (options.timeout || 60) * 1000;

  if (hasAllowCredentials) {
    // Find the one credential on the device with silent probes first, so the
    // user touches the key once instead of once per listed credential.
    const candidates = await narrowCandidates(options.allowCredentials, (cred) =>
      probeCredential(device, [...inputLines, base64urlDecode(cred.id).toString("base64")], options.abortSignal),
    );
    return tryAllowCredentials({ ...options, allowCredentials: candidates }, args, inputLines, timeoutMs, clientDataJSON);
  }

  // No allowCredentials — use resident key mode
  log.debug("[WEBAUTHN] getAssertion resident-key mode");
  const { stdout } = await spawnFido2(
    "fido2-assert", args, inputLines, timeoutMs,
    options.preCollectedPin || null, options.abortSignal,
  );
  return parseAssertionOutput(stdout, options, clientDataJSON, null);
}

/**
 * Parse fido2-assert stdout into a structured assertion result.
 * @param {string} stdout - Raw stdout from fido2-assert
 * @param {object} options - Original assertion options (for rpId, allowCredentials)
 * @param {Buffer} clientDataJSON - The clientDataJSON buffer
 * @param {string|null} credentialId - The credentialId which was used for the assertion
 * @returns {object} Assertion result
 */
function parseAssertionOutput(stdout, options, clientDataJSON, credentialId) {
  const lines = stdout.trim().split("\n");
  // fido2-assert may echo back input lines like fido2-cred does.
  const echoOffset = lines.length > 2 && lines[1] === sanitizeForFido2(options.rpId) ? 2 : 0;
  const dataLines = lines.slice(echoOffset);
  if (dataLines.length < 2) {
    throw new Error(`NotAllowedError: Unexpected fido2-assert output format. Expected at least 2 lines, got ${dataLines.length}.`);
  }

  const authData = cborDecode(Buffer.from(dataLines[0], "base64"));
  const assertSignature = Buffer.from(dataLines[1], "base64");

  if (!credentialId) {
    if (dataLines.length >= 3) {
      credentialId = base64urlEncode(Buffer.from(dataLines[2], "base64"));
    } else if (options.allowCredentials?.length === 1) {
      credentialId = options.allowCredentials[0].id;
    } else {
      throw new Error("NotAllowedError: fido2-assert did not return a credential ID and multiple credentials were allowed");
    }
  }
  const userHandle = dataLines.length >= 4
    ? base64urlEncode(Buffer.from(dataLines[3], "base64"))
    : null;

  return {
    credentialId,
    rawId: credentialId,
    authenticatorData: base64urlEncode(authData),
    clientDataJson: base64urlEncode(clientDataJSON),
    signature: base64urlEncode(assertSignature),
    userHandle,
    type: "public-key",
  };
}

module.exports = { isAvailable, discoverDevices, createCredential, getAssertion, CANCELLED_MESSAGE };

// Exposed so the cancellation path can be unit-tested against a real detached
// child process. Not part of the module's contract — do not use from app code.
module.exports._spawnFido2 = spawnFido2;

// Exposed for unit tests only, same caveat as above.
module.exports._narrowCandidates = narrowCandidates;
