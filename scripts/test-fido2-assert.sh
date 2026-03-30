#!/usr/bin/env bash
#
# test-fido2-assert.sh — Exercise the fido2-assert (assertion/sign-in) flow
#
# This script is a debugging and testing aid for community testers with
# FIDO2 hardware security keys (e.g., YubiKey). It replicates the assertion
# flow that fido2Backend.js performs: device discovery, clientDataHash
# generation, and fido2-assert -G invocation.
#
# Usage:
#   ./scripts/test-fido2-assert.sh [--rp-id <rpId>] [--cred-id <base64>]
#
# Arguments:
#   --rp-id     Relying party ID (default: login.microsoft.com)
#   --cred-id   Credential ID in base64 encoding. If omitted, the script
#               attempts to discover resident credentials on the device.
#
# Requirements:
#   - fido2-tools (fido2-token, fido2-assert) must be installed
#     Debian/Ubuntu: sudo apt install fido2-tools
#     Fedora:        sudo dnf install fido2-tools
#     Arch:          sudo pacman -S libfido2
#   - A FIDO2 hardware security key must be plugged in
#
# Reference: https://developers.yubico.com/libfido2/Manuals/fido2-assert.html
# Related:   app/webauthn/fido2Backend.js (getAssertion function)

set -euo pipefail

# -------------------------------------------------------------------
# Parse command-line arguments
# -------------------------------------------------------------------
RP_ID="login.microsoft.com"
CRED_ID=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --rp-id)
      RP_ID="$2"
      shift 2
      ;;
    --cred-id)
      CRED_ID="$2"
      shift 2
      ;;
    -h|--help)
      echo "Usage: $0 [--rp-id <rpId>] [--cred-id <base64>]"
      echo ""
      echo "  --rp-id     Relying party ID (default: login.microsoft.com)"
      echo "  --cred-id   Credential ID in base64. If omitted, discovers resident credentials."
      echo ""
      echo "Exercises the fido2-assert -G assertion flow used by Teams for Linux"
      echo "for FIDO2 hardware security key sign-in."
      exit 0
      ;;
    *)
      echo "Unknown argument: $1"
      echo "Run $0 --help for usage."
      exit 1
      ;;
  esac
done

# -------------------------------------------------------------------
# Step 1: Verify fido2-tools are installed
#
# The fido2Backend.js isAvailable() function checks for fido2-cred,
# fido2-assert, and fido2-token on PATH. We do the same here.
# -------------------------------------------------------------------
echo "=== Step 1: Checking fido2-tools installation ==="

MISSING_TOOLS=()
for tool in fido2-token fido2-assert; do
  if ! command -v "$tool" &>/dev/null; then
    MISSING_TOOLS+=("$tool")
  fi
done

if [[ ${#MISSING_TOOLS[@]} -gt 0 ]]; then
  echo "ERROR: Missing required tools: ${MISSING_TOOLS[*]}"
  echo ""
  echo "Install fido2-tools for your distribution:"
  echo "  Debian/Ubuntu: sudo apt install fido2-tools"
  echo "  Fedora:        sudo dnf install fido2-tools"
  echo "  Arch:          sudo pacman -S libfido2"
  exit 1
fi

# Print the version for diagnostic purposes
FIDO2_VERSION=$(fido2-token -V 2>&1 || true)
echo "fido2-tools version: ${FIDO2_VERSION:-unknown}"
echo ""

# -------------------------------------------------------------------
# Step 2: Detect connected FIDO2 devices
#
# fido2-token -L lists connected FIDO2 devices. Output format:
#   /dev/hidraw11: vendor=0x1050, product=0x0407 (Yubico YubiKey OTP+FIDO+CCID)
#
# The fido2Backend.js discoverDevices() function parses this output.
# Important: the device path has a trailing colon that must be stripped
# (this was Bug 2 from community validation).
# -------------------------------------------------------------------
echo "=== Step 2: Detecting FIDO2 devices ==="

DEVICE_LIST=$(fido2-token -L 2>/dev/null || true)

if [[ -z "$DEVICE_LIST" ]]; then
  echo "ERROR: No FIDO2 devices detected."
  echo "Make sure your security key is plugged in and accessible."
  echo ""
  echo "Troubleshooting:"
  echo "  - Check USB connection"
  echo "  - Verify udev rules allow access (you may need to add your user to"
  echo "    the 'plugdev' group or install vendor udev rules)"
  echo "  - Try: sudo fido2-token -L"
  exit 1
fi

echo "Detected devices:"
echo "$DEVICE_LIST"
echo ""

# Extract the first device path, stripping the trailing colon.
# The regex uses a colon lookahead to avoid including it in the path,
# matching the fix for Bug 2 identified in community validation.
DEVICE=$(echo "$DEVICE_LIST" | head -n1 | grep -oP '^/dev/\S+(?=:)' || true)

if [[ -z "$DEVICE" ]]; then
  # Fallback: try extracting path by splitting on colon
  DEVICE=$(echo "$DEVICE_LIST" | head -n1 | cut -d: -f1 | tr -d '[:space:]')
fi

if [[ -z "$DEVICE" ]]; then
  echo "ERROR: Could not parse device path from fido2-token -L output."
  exit 1
fi

echo "Using device: $DEVICE"
echo ""

# -------------------------------------------------------------------
# Step 3: Discover resident credentials (if no --cred-id provided)
#
# fido2-token -Lr <device> lists resident (discoverable) credentials
# stored on the key for a given relying party. This is useful when the
# user doesn't know their credential ID.
#
# If a credential ID was provided via --cred-id, this step is skipped.
# -------------------------------------------------------------------
if [[ -z "$CRED_ID" ]]; then
  echo "=== Step 3: Discovering resident credentials for RP '$RP_ID' ==="
  echo "(No --cred-id provided, attempting resident credential discovery)"
  echo ""
  echo "Note: This requires the key's PIN. If your key has no resident"
  echo "credentials for this RP, you can re-run with --cred-id <base64>."
  echo ""

  # fido2-token -Lr lists all RPs with resident credentials.
  # This may prompt for PIN interactively.
  RESIDENT_OUTPUT=$(fido2-token -L -r "$DEVICE" 2>&1 || true)

  if [[ -n "$RESIDENT_OUTPUT" ]]; then
    echo "Resident credential info from device:"
    echo "$RESIDENT_OUTPUT"
    echo ""
    echo "If you see a credential ID above for RP '$RP_ID', you can"
    echo "re-run this script with: --cred-id <the-base64-id>"
  else
    echo "No resident credentials found (or device returned empty output)."
    echo "This is normal if no discoverable credentials have been created"
    echo "for '$RP_ID' on this key."
  fi

  echo ""
  echo "Proceeding without a credential ID (non-resident assertion)."
  echo "fido2-assert will attempt an assertion without specifying a credential."
  echo ""
else
  echo "=== Step 3: Using provided credential ID ==="
  echo "Credential ID: $CRED_ID"
  echo ""
fi

# -------------------------------------------------------------------
# Step 4: Generate a fake clientDataHash for testing
#
# In real WebAuthn, the clientDataHash is SHA-256(clientDataJSON) where
# clientDataJSON contains the challenge, origin, and type. The
# fido2Backend.js getAssertion() function computes this properly.
#
# For testing, we generate 32 random bytes and base64-encode them.
# fido2-tools expect standard base64 (not base64url) — this was the
# root cause of Bug 1 and Bug 4 from community validation.
# -------------------------------------------------------------------
echo "=== Step 4: Generating test clientDataHash ==="

# Generate 32 random bytes encoded as standard base64 (with padding).
# fido2-tools expect standard base64, NOT hex or base64url.
CLIENT_DATA_HASH=$(openssl rand -base64 32)

echo "clientDataHash (base64): $CLIENT_DATA_HASH"
echo ""

# -------------------------------------------------------------------
# Step 5: Build the input and run fido2-assert -G
#
# fido2-assert -G reads a line-based protocol from stdin:
#   Line 1: client data hash (base64)
#   Line 2: relying party id (string)
#   Line 3: credential id (base64, optional for resident credentials)
#
# Flags used by fido2Backend.js getAssertion():
#   -G    Generate an assertion (sign-in operation)
#   -h    Use HMAC-secret extension (hmac-secret)
#   -v    Request user verification (PIN). Added when userVerification
#         is "required" or "preferred", which is always the case for
#         Microsoft Entra ID FIDO2 sign-in.
#
# The PIN prompt will appear on stderr when -v is used. In this script
# it is handled interactively by the terminal (fido2-assert reads the
# PIN directly from the TTY when run in a terminal).
#
# Reference: https://developers.yubico.com/libfido2/Manuals/fido2-assert.html
# -------------------------------------------------------------------
echo "=== Step 5: Running fido2-assert -G ==="

# Build the fido2-assert command arguments.
# Matches fido2Backend.js: args = ["-G", "-r"], then optionally "-v", then device.
# -r enables resident/discoverable credential mode (required for Microsoft Entra ID).
# -h (hmac-secret) is intentionally omitted — it prevents resident assertions
# from working without an explicit credential ID (validated by rlavriv, fido2-tools 1.16.0).
ASSERT_ARGS=("-G" "-r")

# Always include -v (user verification) since Microsoft Entra ID requires it
# for FIDO2 sign-in. The user will be prompted for their PIN interactively.
ASSERT_ARGS+=("-v")

ASSERT_ARGS+=("$DEVICE")

echo "Command: fido2-assert ${ASSERT_ARGS[*]}"
echo ""

# Build the stdin input line by line.
# The format matches what fido2Backend.js sends to the spawned process.
INPUT_LINES="$CLIENT_DATA_HASH"$'\n'"$RP_ID"

if [[ -n "$CRED_ID" ]]; then
  # Non-resident assertion: include the credential ID as line 3
  INPUT_LINES="$INPUT_LINES"$'\n'"$CRED_ID"
  echo "Input (3 lines — non-resident assertion with credential ID):"
else
  # Resident/discoverable assertion: only 2 input lines
  echo "Input (2 lines — resident/discoverable assertion):"
fi

echo "  Line 1 (clientDataHash): $CLIENT_DATA_HASH"
echo "  Line 2 (rpId):           $RP_ID"
if [[ -n "$CRED_ID" ]]; then
  echo "  Line 3 (credentialId):   $CRED_ID"
fi
echo ""

echo ">>> Sending to fido2-assert. You may be prompted for your PIN."
echo ">>> Touch your security key when it blinks."
echo ""

# Run fido2-assert with the constructed input.
# We capture stdout (the assertion result) and let stderr (PIN prompt)
# pass through to the terminal so the user can enter their PIN.
ASSERT_OUTPUT=$(echo "$INPUT_LINES" | fido2-assert "${ASSERT_ARGS[@]}" 2>/dev/tty) || {
  EXIT_CODE=$?
  echo ""
  echo "ERROR: fido2-assert exited with code $EXIT_CODE"
  echo ""
  echo "Common causes:"
  echo "  - 'input error': encoding mismatch (ensure base64, not hex)"
  echo "  - No credential found for this RP on the key"
  echo "  - PIN was incorrect or entry was cancelled"
  echo "  - Key was not touched within the timeout period"
  echo ""
  echo "Try running with a specific credential ID:"
  echo "  $0 --cred-id <base64-encoded-credential-id>"
  exit $EXIT_CODE
}

# -------------------------------------------------------------------
# Step 6: Parse and display the assertion output
#
# fido2-assert -G output format (per Yubico docs and fido2Backend.js):
#   Line 1: authenticator data (base64)
#   Line 2: signature (base64)
#   Line 3: credential id (base64, only if resident/discoverable)
#   Line 4: user handle (base64, only if resident/discoverable)
#
# Note: the community validation (Bug 3) found that fido2-cred echoes
# back input lines before the output. The same may happen with
# fido2-assert — if so, the output lines would be offset. This script
# displays all lines so testers can verify the actual format.
# -------------------------------------------------------------------
echo ""
echo "=== Step 6: Assertion output ==="
echo ""

if [[ -z "$ASSERT_OUTPUT" ]]; then
  echo "WARNING: fido2-assert produced no output (0 lines)."
  echo "This may indicate a bug — see Bug 4 in the implementation plan."
  exit 1
fi

# Display raw output with line numbers for debugging
echo "Raw output (with line numbers):"
LINE_NUM=0
while IFS= read -r line; do
  echo "  Line $LINE_NUM: $line"
  LINE_NUM=$((LINE_NUM + 1))
done <<< "$ASSERT_OUTPUT"
echo ""

# Parse the output into named fields.
# fido2Backend.js getAssertion() expects:
#   lines[0] = authData (base64)
#   lines[1] = signature (base64)
#   lines[2] = credentialId (base64, optional)
#   lines[3] = userHandle (base64, optional)
readarray -t LINES <<< "$ASSERT_OUTPUT"
TOTAL_LINES=${#LINES[@]}

echo "Parsed assertion fields:"
echo ""

if [[ $TOTAL_LINES -ge 1 ]]; then
  AUTH_DATA="${LINES[0]}"
  AUTH_DATA_BYTES=$(echo "$AUTH_DATA" | base64 -d 2>/dev/null | wc -c || echo "?")
  echo "  authenticatorData: $AUTH_DATA"
  echo "    (${AUTH_DATA_BYTES} bytes decoded)"
fi

if [[ $TOTAL_LINES -ge 2 ]]; then
  SIGNATURE="${LINES[1]}"
  SIG_BYTES=$(echo "$SIGNATURE" | base64 -d 2>/dev/null | wc -c || echo "?")
  echo "  signature:         $SIGNATURE"
  echo "    (${SIG_BYTES} bytes decoded)"
fi

if [[ $TOTAL_LINES -ge 3 ]]; then
  RESULT_CRED_ID="${LINES[2]}"
  CRED_BYTES=$(echo "$RESULT_CRED_ID" | base64 -d 2>/dev/null | wc -c || echo "?")
  echo "  credentialId:      $RESULT_CRED_ID"
  echo "    (${CRED_BYTES} bytes decoded)"
fi

if [[ $TOTAL_LINES -ge 4 ]]; then
  USER_HANDLE="${LINES[3]}"
  echo "  userHandle:        $USER_HANDLE"
fi

echo ""
echo "=== Assertion completed successfully ==="
echo ""
echo "Total output lines: $TOTAL_LINES"
echo ""

# Summarize what fido2Backend.js would do with this output
if [[ $TOTAL_LINES -lt 2 ]]; then
  echo "WARNING: fido2Backend.js expects at least 2 output lines (authData + signature)."
  echo "This output would cause a 'Unexpected fido2-assert output format' error."
elif [[ $TOTAL_LINES -eq 2 ]]; then
  echo "This is a non-resident assertion result (no credential ID in output)."
  echo "fido2Backend.js would use the credential ID from allowCredentials."
elif [[ $TOTAL_LINES -ge 3 ]]; then
  echo "This is a resident/discoverable assertion result with credential ID."
  if [[ $TOTAL_LINES -ge 4 ]]; then
    echo "User handle is also present (used for account identification)."
  fi
fi

echo ""
echo "If the output format differs from what is documented above, please"
echo "report it at: https://github.com/IsmaelMartinez/teams-for-linux/issues/802"
echo "Include your fido2-tools version, device info, and the raw output."
