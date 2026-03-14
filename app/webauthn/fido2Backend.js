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
    return stdout
      .trim()
      .split("\n")
      .filter((line) => line.length > 0)
      .map((line) => {
        const match = line.match(/^(\/dev\/\S+)/);
        return match ? match[1] : null;
      })
      .filter(Boolean);
  } catch {
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

  const userIdHex = Buffer.from(base64urlDecode(options.userId)).toString("hex");
  const input = [
    clientDataHash.toString("hex"),
    sanitizeForFido2(options.rpId),
    sanitizeForFido2(options.userName),
    userIdHex,
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
  if (lines.length < 4) {
    throw new Error("NotAllowedError: Unexpected fido2-cred output format");
  }

  const authData = Buffer.from(lines[1], "base64");
  const credId = lines.length >= 5
    ? Buffer.from(lines[4], "base64")
    : authData.subarray(55, 55 + authData[53] * 256 + authData[54]);

  // Build a proper CBOR-encoded attestation object.
  // fido2-cred outputs: format, authData, x509 cert, signature (each base64 on separate lines).
  // The attestation object is a CBOR map: { fmt, attStmt, authData }.
  const fmt = lines[0].trim();
  const attStmt = fmt === "none"
    ? {}
    : {
        x5c: [Buffer.from(lines[2], "base64")],
        sig: Buffer.from(lines[3], "base64"),
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

  const inputLines = [clientDataHash.toString("hex"), sanitizeForFido2(options.rpId)];

  if (options.allowCredentials && options.allowCredentials.length > 0) {
    for (const cred of options.allowCredentials) {
      inputLines.push(Buffer.from(base64urlDecode(cred.id)).toString("hex"));
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
  if (lines.length < 2) {
    throw new Error("NotAllowedError: Unexpected fido2-assert output format");
  }

  const authData = Buffer.from(lines[0], "base64");
  const signature = Buffer.from(lines[1], "base64");
  let credentialId;
  if (lines.length >= 3) {
    credentialId = base64urlEncode(Buffer.from(lines[2], "base64"));
  } else if (options.allowCredentials && options.allowCredentials.length === 1) {
    credentialId = options.allowCredentials[0].id;
  } else {
    throw new Error("NotAllowedError: fido2-assert did not return a credential ID and multiple credentials were allowed");
  }
  const userHandle = lines.length >= 4
    ? base64urlEncode(Buffer.from(lines[3], "base64"))
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
