#!/usr/bin/env bash
#
# test-webauthn-flow.sh - Container-side script that exercises virtual-fido + fido2-tools
#
# This script runs inside the Docker container and tests:
#   Phase 1: Kernel module loading and virtual-fido startup
#   Phase 2: Device detection via fido2-token -L
#   Phase 3: Credential creation via fido2-cred -M (WebAuthn registration)
#   Phase 4: Assertion via fido2-assert -G (WebAuthn sign-in)
#
# The encoding matches what teams-for-linux's fido2Backend.js uses:
#   - clientDataHash: SHA-256 of clientDataJSON, encoded as standard base64
#   - rpId, userName: plain strings
#   - userId: standard base64
#   - credentialId: standard base64
#
# Uses test.example.com as the rpId. No real credentials are created.
#
# virtual-fido's demo server prompts for interactive approval on stdin for
# each FIDO2 operation. We pipe "yes" to auto-approve all prompts.

set -euo pipefail

# =====================================================================
# Helpers
# =====================================================================

PASS_COUNT=0
FAIL_COUNT=0
SKIP_COUNT=0

pass() {
    PASS_COUNT=$((PASS_COUNT + 1))
    echo "  PASS: $1"
}

fail() {
    FAIL_COUNT=$((FAIL_COUNT + 1))
    echo "  FAIL: $1"
    if [[ -n "${2:-}" ]]; then
        echo "        Reason: $2"
    fi
}

skip() {
    SKIP_COUNT=$((SKIP_COUNT + 1))
    echo "  SKIP: $1"
    if [[ -n "${2:-}" ]]; then
        echo "        Reason: $2"
    fi
}

summary() {
    echo ""
    echo "============================================="
    echo "  RESULTS: ${PASS_COUNT} passed, ${FAIL_COUNT} failed, ${SKIP_COUNT} skipped"
    echo "============================================="
    if [[ ${FAIL_COUNT} -gt 0 ]]; then
        echo ""
        echo "  Some tests failed. See details above."
        return 1
    elif [[ ${SKIP_COUNT} -gt 0 && ${PASS_COUNT} -eq 0 ]]; then
        echo ""
        echo "  All tests skipped. The vhci-hcd kernel module is likely"
        echo "  not available in this Docker environment."
        return 2
    fi
    return 0
}

cleanup() {
    echo ""
    echo "Cleaning up..."
    # Kill virtual-fido if it's running
    if [[ -n "${VFIDO_PID:-}" ]]; then
        kill "$VFIDO_PID" 2>/dev/null || true
        wait "$VFIDO_PID" 2>/dev/null || true
    fi
    # Detach the USB/IP device if attached
    usbip detach -p 00 2>/dev/null || true
}

trap cleanup EXIT

# =====================================================================
# Phase 1: Kernel module and virtual-fido setup
# =====================================================================

echo ""
echo "============================================="
echo "  Phase 1: Kernel module and virtual-fido"
echo "============================================="
echo ""

echo "Kernel: $(uname -r)"
echo "Architecture: $(uname -m)"
echo ""

# Verify fido2-tools are installed
for tool in fido2-token fido2-cred fido2-assert; do
    if command -v "$tool" &>/dev/null; then
        VERSION=$("$tool" -V 2>&1 || echo "unknown")
        pass "$tool is installed (version: ${VERSION})"
    else
        fail "$tool is not installed"
    fi
done

# Verify virtual-fido binary
if [[ -x /usr/local/bin/virtual-fido ]]; then
    pass "virtual-fido binary built successfully"
else
    fail "virtual-fido binary not found"
    summary
    exit $?
fi

echo ""

# Check if vhci-hcd is already loaded, try to load if not
VHCI_LOADED=false
if lsmod 2>/dev/null | grep -q vhci_hcd; then
    echo "vhci-hcd module is already loaded."
    VHCI_LOADED=true
    pass "vhci-hcd module present"
else
    echo "vhci-hcd module is not loaded. Attempting to load..."

    if modprobe vhci-hcd 2>&1; then
        # Verify it actually loaded
        if lsmod 2>/dev/null | grep -q vhci_hcd; then
            echo "Successfully loaded vhci-hcd module."
            VHCI_LOADED=true
            pass "vhci-hcd module loaded via modprobe"
        else
            echo "modprobe reported success but module not in lsmod."
            fail "vhci-hcd module failed to load" "modprobe succeeded but module not visible"
        fi
    else
        echo ""
        echo "Could not load vhci-hcd module."
        echo ""
        echo "This is expected on Docker Desktop for macOS. The Docker VM"
        echo "uses a minimal LinuxKit kernel that typically does not include"
        echo "the vhci-hcd module. This module is part of the USB/IP subsystem"
        echo "and is required for virtual-fido to present a virtual USB HID"
        echo "device."
        echo ""
        echo "Possible workarounds:"
        echo "  1. Run on a native Linux host with vhci-hcd available"
        echo "  2. Use a Linux VM (Lima, UTM) with a full kernel"
        echo "  3. Run on GitHub Actions (ubuntu runners have full kernels)"
        echo "  4. Build a custom Docker Desktop kernel with CONFIG_USBIP_VHCI_HCD=m"
        echo ""
        fail "vhci-hcd module not available" \
             "Docker VM kernel does not include vhci-hcd"
    fi
fi

# If vhci-hcd is not available, skip all device-dependent tests
if [[ "$VHCI_LOADED" != "true" ]]; then
    echo ""
    echo "Skipping Phases 2-4 because vhci-hcd is not available."
    echo "virtual-fido cannot create a virtual USB device without it."
    skip "Device detection (Phase 2)" "vhci-hcd not available"
    skip "Credential creation (Phase 3)" "vhci-hcd not available"
    skip "Assertion (Phase 4)" "vhci-hcd not available"
    summary
    exit $?
fi

# Check if usbip userspace tool is available
if ! command -v usbip &>/dev/null; then
    echo ""
    echo "usbip command not found. Checking alternative locations..."
    # On some systems it's in /usr/lib/linux-tools/
    USBIP_PATH=$(find /usr/lib/linux-tools/ -name usbip -type f 2>/dev/null | head -1 || true)
    if [[ -n "$USBIP_PATH" ]]; then
        echo "Found usbip at: $USBIP_PATH"
        export PATH="$(dirname "$USBIP_PATH"):$PATH"
        pass "usbip found at $USBIP_PATH"
    else
        fail "usbip command not found anywhere" \
             "Cannot attach virtual USB device without usbip userspace tool"
        skip "Device detection (Phase 2)" "usbip not available"
        skip "Credential creation (Phase 3)" "usbip not available"
        skip "Assertion (Phase 4)" "usbip not available"
        summary
        exit $?
    fi
else
    pass "usbip command available"
fi

# =====================================================================
# Phase 2: Start virtual-fido and detect the device
# =====================================================================

echo ""
echo "============================================="
echo "  Phase 2: Device detection"
echo "============================================="
echo ""

# virtual-fido's demo "start" command:
#   1. Starts a USB/IP server on 127.0.0.1 (TCP)
#   2. Runs "usbip attach -r 127.0.0.1 -b 2-2" to connect the virtual device
#   3. Reads stdin for interactive approval prompts (Y/n)
#
# We use "yes" to auto-approve all prompts. The --vault and --passphrase
# flags are required by cobra; we use test values.
echo "Starting virtual-fido daemon with auto-approval..."

# Create a named pipe (FIFO) for feeding approval responses.
# We use "yes" which continuously outputs "y\n" lines, matching what
# the prompt() function in server.go expects.
VFIDO_LOG="/tmp/virtual-fido.log"
yes | /usr/local/bin/virtual-fido start \
    --vault /tmp/test-vault.json \
    --passphrase "test-spike-passphrase" \
    &>"$VFIDO_LOG" &
VFIDO_PID=$!

# Give virtual-fido time to:
#   1. Start the USB/IP TCP server
#   2. Run "usbip attach" internally (exec_linux.go)
#   3. Let the kernel enumerate the new USB device
echo "Waiting for virtual USB device to appear (up to 15 seconds)..."
DEVICE=""
for i in $(seq 1 30); do
    sleep 0.5

    # Check if virtual-fido is still running
    if ! kill -0 "$VFIDO_PID" 2>/dev/null; then
        echo ""
        echo "virtual-fido exited prematurely after ~$((i / 2)) seconds."
        echo ""
        echo "Log output:"
        cat "$VFIDO_LOG" 2>/dev/null || echo "(no log output)"
        echo ""

        # Check if it failed because usbip attach failed
        if grep -qi "error" "$VFIDO_LOG" 2>/dev/null; then
            fail "virtual-fido daemon crashed on startup" \
                 "See log output above"
        else
            fail "virtual-fido daemon exited unexpectedly" \
                 "Process terminated without error output"
        fi
        break
    fi

    # Try to detect the device via fido2-token
    DEVICE_OUTPUT=$(fido2-token -L 2>/dev/null || true)
    if [[ -n "$DEVICE_OUTPUT" ]]; then
        # Parse device path, stripping trailing colon (same as fido2Backend.js)
        DEVICE=$(echo "$DEVICE_OUTPUT" | head -n1 | sed 's/:.*//')
        break
    fi
done

if [[ -n "$DEVICE" ]]; then
    pass "Virtual FIDO2 device detected"
    echo "  Device path: $DEVICE"
    echo "  fido2-token -L output: $DEVICE_OUTPUT"
    echo ""

    # Show USB device info for diagnostics
    echo "  USB devices:"
    lsusb 2>/dev/null || echo "  (lsusb not available)"
else
    if kill -0 "$VFIDO_PID" 2>/dev/null; then
        fail "Virtual FIDO2 device not detected after 15 seconds" \
             "virtual-fido is running but fido2-token -L sees no devices"
        echo ""
        echo "  virtual-fido log (last 20 lines):"
        tail -20 "$VFIDO_LOG" 2>/dev/null || echo "  (no log output)"
        echo ""
        echo "  USB devices:"
        lsusb 2>/dev/null || echo "  (lsusb not available)"
        echo ""
        echo "  /dev/hidraw* devices:"
        ls -la /dev/hidraw* 2>/dev/null || echo "  (no hidraw devices)"
    fi

    skip "Credential creation (Phase 3)" "no device detected"
    skip "Assertion (Phase 4)" "no device detected"

    summary
    exit $?
fi

# =====================================================================
# Phase 3: Credential creation (fido2-cred -M)
# =====================================================================

echo ""
echo "============================================="
echo "  Phase 3: Credential creation (registration)"
echo "============================================="
echo ""

# Generate test data matching the format used by fido2Backend.js.
#
# fido2Backend.js createCredential() sends to fido2-cred -M -h:
#   Line 1: clientDataHash (SHA-256 of clientDataJSON, standard base64)
#   Line 2: rpId (plain string)
#   Line 3: userName (plain string)
#   Line 4: userId (raw bytes, standard base64)
#
# The clientDataJSON format from helpers.js generateClientDataJSON():
#   {"type":"webauthn.create","challenge":"<base64url>","origin":"...","crossOrigin":false}

RP_ID="test.example.com"
USER_NAME="testuser"

# Generate a fake challenge (32 random bytes)
CHALLENGE_BYTES_HEX=$(openssl rand -hex 32)
# Convert to base64url (matching helpers.js base64urlEncode)
CHALLENGE_B64URL=$(echo -n "$CHALLENGE_BYTES_HEX" | xxd -r -p | base64 | tr '+/' '-_' | tr -d '=')

# Build clientDataJSON exactly as helpers.js does
CLIENT_DATA_JSON="{\"type\":\"webauthn.create\",\"challenge\":\"${CHALLENGE_B64URL}\",\"origin\":\"https://${RP_ID}\",\"crossOrigin\":false}"

# Hash it (SHA-256) and encode as standard base64 for fido2-tools stdin
CLIENT_DATA_HASH=$(printf '%s' "$CLIENT_DATA_JSON" | openssl dgst -sha256 -binary | base64)

# Generate a fake userId (16 random bytes, standard base64)
USER_ID_B64=$(openssl rand -base64 16)

echo "Test parameters:"
echo "  rpId:           $RP_ID"
echo "  userName:       $USER_NAME"
echo "  userId (b64):   $USER_ID_B64"
echo "  clientDataHash: $CLIENT_DATA_HASH"
echo ""

# fido2-cred -M -h <device>
#   -M = make credential
#   -h = hmac-secret extension (used by fido2Backend.js buildCredArgs)
# No -r (resident key) and no -v (user verification) for this test,
# since virtual-fido has PIN disabled by default.
echo "Running: fido2-cred -M -h $DEVICE"
echo "  Input: 4 lines (standard base64, matching fido2Backend.js format)"
echo ""

CRED_INPUT="${CLIENT_DATA_HASH}
${RP_ID}
${USER_NAME}
${USER_ID_B64}"

CRED_OUTPUT=""
CRED_EXIT=0
CRED_OUTPUT=$(echo "$CRED_INPUT" | fido2-cred -M -h "$DEVICE" 2>/tmp/fido2-cred-stderr.txt) || CRED_EXIT=$?

CRED_STDERR=$(cat /tmp/fido2-cred-stderr.txt 2>/dev/null || true)

if [[ $CRED_EXIT -eq 0 && -n "$CRED_OUTPUT" ]]; then
    pass "fido2-cred -M succeeded (credential created)"
    echo ""

    # Display raw output lines
    echo "  Raw output:"
    LINE_NUM=0
    while IFS= read -r line; do
        echo "    Line $LINE_NUM: ${line:0:60}$([ ${#line} -gt 60 ] && echo '...')"
        LINE_NUM=$((LINE_NUM + 1))
    done <<< "$CRED_OUTPUT"
    echo ""

    # Parse output matching fido2Backend.js createCredential() logic.
    # Expected: fmt, authData, credId, signature, [x509]
    # Some versions echo back the first two input lines (clientDataHash + rpId).
    readarray -t CRED_LINES <<< "$CRED_OUTPUT"
    TOTAL_CRED_LINES=${#CRED_LINES[@]}

    # Detect echoed input (fido2-cred v1.16.0+ echoes clientDataHash + rpId)
    ECHO_OFFSET=0
    if [[ $TOTAL_CRED_LINES -gt 2 && "${CRED_LINES[1]}" == "$RP_ID" ]]; then
        ECHO_OFFSET=2
        echo "  Detected echoed input lines (offset=$ECHO_OFFSET)"
    fi

    DATA_LINES=("${CRED_LINES[@]:$ECHO_OFFSET}")
    DATA_COUNT=${#DATA_LINES[@]}

    if [[ $DATA_COUNT -ge 4 ]]; then
        CRED_FMT="${DATA_LINES[0]}"
        CRED_AUTH_DATA="${DATA_LINES[1]}"
        CRED_ID_B64="${DATA_LINES[2]}"
        CRED_SIG="${DATA_LINES[3]}"

        echo "  Parsed fields (same as fido2Backend.js):"
        echo "    fmt:       $CRED_FMT"
        echo "    authData:  ${CRED_AUTH_DATA:0:40}... ($(echo "$CRED_AUTH_DATA" | base64 -d 2>/dev/null | wc -c | tr -d ' ') bytes)"
        echo "    credId:    ${CRED_ID_B64:0:40}... ($(echo "$CRED_ID_B64" | base64 -d 2>/dev/null | wc -c | tr -d ' ') bytes)"
        echo "    signature: ${CRED_SIG:0:40}..."

        if [[ $DATA_COUNT -ge 5 ]]; then
            echo "    x509 cert: present (${DATA_LINES[4]:0:40}...)"
        fi

        pass "Credential output parsed successfully ($DATA_COUNT data lines)"
    else
        fail "Credential output has too few data lines" \
             "Expected >=4, got $DATA_COUNT"
    fi
else
    fail "fido2-cred -M failed (exit code: $CRED_EXIT)"
    if [[ -n "$CRED_STDERR" ]]; then
        echo "  stderr: $CRED_STDERR"
    fi

    skip "Assertion (Phase 4)" "credential creation failed"
    summary
    exit $?
fi

# =====================================================================
# Phase 4: Assertion (fido2-assert -G)
# =====================================================================

echo ""
echo "============================================="
echo "  Phase 4: Assertion (sign-in)"
echo "============================================="
echo ""

# Generate a new challenge for the assertion (different from registration).
# This mirrors fido2Backend.js getAssertion() flow.
ASSERT_CHALLENGE_HEX=$(openssl rand -hex 32)
ASSERT_CHALLENGE_B64URL=$(echo -n "$ASSERT_CHALLENGE_HEX" | xxd -r -p | base64 | tr '+/' '-_' | tr -d '=')
ASSERT_CLIENT_DATA_JSON="{\"type\":\"webauthn.get\",\"challenge\":\"${ASSERT_CHALLENGE_B64URL}\",\"origin\":\"https://${RP_ID}\",\"crossOrigin\":false}"
ASSERT_CLIENT_DATA_HASH=$(printf '%s' "$ASSERT_CLIENT_DATA_JSON" | openssl dgst -sha256 -binary | base64)

echo "Assertion parameters:"
echo "  rpId:           $RP_ID"
echo "  clientDataHash: $ASSERT_CLIENT_DATA_HASH"
echo "  credentialId:   ${CRED_ID_B64:0:40}..."
echo ""

# fido2-assert -G <device>
#   -G = get assertion
# Input (3 lines for non-resident assertion, matching fido2Backend.js):
#   Line 1: clientDataHash (standard base64)
#   Line 2: rpId (plain string)
#   Line 3: credentialId (standard base64)
#
# This simulates the allowCredentials flow where the server provides
# a list of credential IDs and fido2Backend.js tries each one.
echo "Running: fido2-assert -G $DEVICE"
echo "  Input: 3 lines (non-resident assertion with credentialId)"
echo ""

ASSERT_INPUT="${ASSERT_CLIENT_DATA_HASH}
${RP_ID}
${CRED_ID_B64}"

ASSERT_OUTPUT=""
ASSERT_EXIT=0
ASSERT_OUTPUT=$(echo "$ASSERT_INPUT" | fido2-assert -G "$DEVICE" 2>/tmp/fido2-assert-stderr.txt) || ASSERT_EXIT=$?

ASSERT_STDERR=$(cat /tmp/fido2-assert-stderr.txt 2>/dev/null || true)

if [[ $ASSERT_EXIT -eq 0 && -n "$ASSERT_OUTPUT" ]]; then
    pass "fido2-assert -G succeeded (assertion generated)"
    echo ""

    # Display raw output lines
    echo "  Raw output:"
    LINE_NUM=0
    while IFS= read -r line; do
        echo "    Line $LINE_NUM: ${line:0:60}$([ ${#line} -gt 60 ] && echo '...')"
        LINE_NUM=$((LINE_NUM + 1))
    done <<< "$ASSERT_OUTPUT"
    echo ""

    # Parse output matching fido2Backend.js parseAssertionOutput() logic.
    # Expected: authData, signature, [credentialId], [userHandle]
    readarray -t ASSERT_LINES <<< "$ASSERT_OUTPUT"
    TOTAL_ASSERT_LINES=${#ASSERT_LINES[@]}

    # Detect echoed input
    A_ECHO_OFFSET=0
    if [[ $TOTAL_ASSERT_LINES -gt 2 && "${ASSERT_LINES[1]}" == "$RP_ID" ]]; then
        A_ECHO_OFFSET=2
        echo "  Detected echoed input lines (offset=$A_ECHO_OFFSET)"
    fi

    A_DATA_LINES=("${ASSERT_LINES[@]:$A_ECHO_OFFSET}")
    A_DATA_COUNT=${#A_DATA_LINES[@]}

    if [[ $A_DATA_COUNT -ge 2 ]]; then
        ASSERT_AUTH_DATA="${A_DATA_LINES[0]}"
        ASSERT_SIG="${A_DATA_LINES[1]}"

        echo "  Parsed fields (same as fido2Backend.js parseAssertionOutput):"
        echo "    authData:  ${ASSERT_AUTH_DATA:0:40}... ($(echo "$ASSERT_AUTH_DATA" | base64 -d 2>/dev/null | wc -c | tr -d ' ') bytes)"
        echo "    signature: ${ASSERT_SIG:0:40}..."

        if [[ $A_DATA_COUNT -ge 3 ]]; then
            echo "    credId:    ${A_DATA_LINES[2]:0:40}..."
        fi
        if [[ $A_DATA_COUNT -ge 4 ]]; then
            echo "    userHandle: ${A_DATA_LINES[3]}"
        fi

        pass "Assertion output parsed successfully ($A_DATA_COUNT data lines)"
    else
        fail "Assertion output has too few data lines" \
             "Expected >=2, got $A_DATA_COUNT"
    fi
else
    fail "fido2-assert -G failed (exit code: $ASSERT_EXIT)"
    if [[ -n "$ASSERT_STDERR" ]]; then
        echo "  stderr: $ASSERT_STDERR"
    fi
fi

# =====================================================================
# Summary
# =====================================================================

summary
exit $?
