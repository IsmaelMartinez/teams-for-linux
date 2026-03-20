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
        console.info("[WEBAUTHN] PIN prompt detected on stderr, collecting PIN via callback");
        pinCallback()
          .then((pin) => {
            console.info("[WEBAUTHN] Writing PIN to fido2-tools stdin");
            proc.stdin.write(pin + "\n");
          })
          .catch((err) => {
            console.warn("[WEBAUTHN] PIN callback failed:", err.message);
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
    console.error("[WEBAUTHN] Failed to discover FIDO2 devices:", err.message);
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
 * @returns {{ clientDataJSON: Buffer, clientDataHash: Buffer }}
 */
function prepareClientData(type, challenge, origin) {
  const challengeBytes = base64urlDecode(challenge);
  const clientDataJSON = generateClientDataJSON(type, challengeBytes, origin);
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
  const device = await resolveDevice();
  console.info("[WEBAUTHN] createCredential: device=%s, rpId=%s, userVerification=%s",
    device, options.rpId, options.authenticatorSelection?.userVerification);

  const { clientDataJSON, clientDataHash } = prepareClientData("webauthn.create", options.challenge, options.origin);

  // fido2-tools expect standard base64, not hex (validated by rlavriv).
  const input = [
    clientDataHash.toString("base64"),
    sanitizeForFido2(options.rpId),
    sanitizeForFido2(options.userName),
    base64urlDecode(options.userId).toString("base64"),
  ].join("\n") + "\n";

  const args = buildCredArgs(options.authenticatorSelection);
  const chosenAlg = selectAlgorithm(options.pubKeyCredParams, args);
  args.push(device);

  const timeoutMs = (options.timeout || 60) * 1000;
  // Always pass PIN callback — spawnFido2 only uses it when prompted.
  const { stdout } = await spawnFido2(
    "fido2-cred", args, input, timeoutMs,
    options.pinCallback || null,
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
  const device = await resolveDevice();
  console.info("[WEBAUTHN] getAssertion: device=%s, rpId=%s, userVerification=%s, allowCredentials=%d",
    device, options.rpId, options.userVerification, options.allowCredentials?.length || 0);

  const { clientDataJSON, clientDataHash } = prepareClientData("webauthn.get", options.challenge, options.origin);

  // fido2-tools expect standard base64, not hex (same as createCredential).
  const inputLines = [clientDataHash.toString("base64"), sanitizeForFido2(options.rpId)];

  if (options.allowCredentials && options.allowCredentials.length > 0) {
    for (const cred of options.allowCredentials) {
      inputLines.push(base64urlDecode(cred.id).toString("base64"));
    }
  }

  const input = inputLines.join("\n") + "\n";

  // -r enables resident/discoverable credential mode (required for Microsoft
  // Entra ID FIDO2 sign-in with YubiKeys). Validated by rlavriv on fido2-tools 1.16.0.
  // -h (hmac-secret) is intentionally omitted — it prevents resident assertions
  // from working without an explicit credential ID.
  const args = ["-G", "-r"];

  // Only add -v for "required" per WebAuthn spec; "preferred" should not force UV.
  if (options.userVerification === "required") {
    args.push("-v");
  }

  args.push(device);
  console.info("[WEBAUTHN] getAssertion: running fido2-assert with args:", args.filter(a => !a.startsWith("/dev")).join(" "));

  const timeoutMs = (options.timeout || 60) * 1000;
  // Always pass PIN callback — spawnFido2 only uses it when prompted.
  const { stdout } = await spawnFido2(
    "fido2-assert", args, input, timeoutMs,
    options.pinCallback || null,
  );

  const lines = stdout.trim().split("\n");
  // fido2-assert may echo back input lines like fido2-cred does.
  // Detect echoed input by checking if the second line matches our rpId.
  // This is defensive — needs further validation with more fido2-tools versions.
  const echoOffset = lines.length > 2 && lines[1] === sanitizeForFido2(options.rpId) ? 2 : 0;
  const dataLines = lines.slice(echoOffset);
  if (dataLines.length < 2) {
    throw new Error(`NotAllowedError: Unexpected fido2-assert output format. Expected at least 2 lines, got ${dataLines.length}.`);
  }

  const authData = Buffer.from(dataLines[0], "base64");
  const assertSignature = Buffer.from(dataLines[1], "base64");
  let credentialId;
  if (dataLines.length >= 3) {
    credentialId = base64urlEncode(Buffer.from(dataLines[2], "base64"));
  } else if (options.allowCredentials?.length === 1) {
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
    signature: base64urlEncode(assertSignature),
    userHandle,
    type: "public-key",
  };
}

module.exports = { isAvailable, discoverDevices, createCredential, getAssertion };
