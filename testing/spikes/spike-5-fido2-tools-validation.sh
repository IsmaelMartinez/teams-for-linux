#!/bin/bash
#
# Spike 5: Validate fido2-tools output format
#
# Purpose: Verify that fido2-cred and fido2-assert produce output in the
# format our WebAuthn implementation plan assumes. This is the highest-risk
# area of the plan — if the output format differs from expectations, the
# parsing logic needs to be adjusted before implementation.
#
# Related: https://github.com/IsmaelMartinez/teams-for-linux/issues/802
#          PR #2327 (WebAuthn/FIDO2 implementation plan)
#
# Prerequisites:
#   - Linux (any distro)
#   - fido2-tools installed (sudo apt install fido2-tools / sudo dnf install fido2-tools)
#   - A FIDO2 USB security key plugged in
#   - openssl (for generating test challenge data)
#
# What this tests:
#   1. Device discovery via fido2-token -L
#   2. Credential creation via fido2-cred -M -h (with and without PIN)
#   3. Assertion via fido2-assert -G -h (with and without PIN)
#   4. Raw output format (line count, base64 validity, field positions)
#
# Usage:
#   chmod +x testing/spikes/spike-5-fido2-tools-validation.sh
#   ./testing/spikes/spike-5-fido2-tools-validation.sh
#
# When done, paste the full terminal output into a comment on PR #2327.

set -euo pipefail

BLUE='\033[0;34m'
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

section() { local msg="$1"; echo -e "\n${BLUE}=== ${msg} ===${NC}\n"; return 0; }
ok()      { local msg="$1"; echo -e "${GREEN}OK:${NC} ${msg}"; return 0; }
warn()    { local msg="$1"; echo -e "${YELLOW}WARN:${NC} ${msg}"; return 0; }
fail()    { local msg="$1"; echo -e "${RED}FAIL:${NC} ${msg}"; return 0; }

# Temp files for capturing output
TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

section "Security note"
echo "This script redacts cryptographic output (attestation certs, signatures,"
echo "credential IDs) so the results are safe to paste into a public GitHub comment."
echo "Only line counts, byte lengths, and format metadata are shown."

section "Environment"
echo "Date:    $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "Distro:  $(cat /etc/os-release 2>/dev/null | grep PRETTY_NAME | cut -d= -f2 | tr -d '"')"
echo "Kernel:  $(uname -r)"

section "Step 1: Check fido2-tools installation"

for cmd in fido2-token fido2-cred fido2-assert; do
  if command -v "$cmd" >/dev/null 2>&1; then
    ok "$cmd found at $(which "$cmd")"
  else
    fail "$cmd not found. Install with: sudo apt install fido2-tools"
    exit 1
  fi
done

# Version (fido2-token -V was added in later versions, may not exist)
echo ""
echo "fido2-token -V output:"
fido2-token -V 2>&1 || warn "fido2-token -V not supported on this version"

section "Step 2: Device discovery (fido2-token -L)"
echo "Raw output of 'fido2-token -L':"
echo "---"
DEVICE_OUTPUT=$(fido2-token -L 2>&1) || true
echo "$DEVICE_OUTPUT"
echo "---"
echo ""

if [[ -z "$DEVICE_OUTPUT" ]]; then
  fail "No output from fido2-token -L. Is your security key plugged in?"
  echo "Plug in your FIDO2 USB key and run this script again."
  exit 1
fi

# Parse device path — this tests our regex assumption
DEVICE=$(echo "$DEVICE_OUTPUT" | head -1 | grep -oP '^/dev/\S+' || true)

if [[ -z "$DEVICE" ]]; then
  # Fallback: try the colon-split approach from the original plan
  DEVICE=$(echo "$DEVICE_OUTPUT" | head -1 | cut -d: -f1 | tr -d ' ')
  warn "Regex /dev/\\S+ didn't match. Colon-split extracted: '$DEVICE'"
else
  ok "Device found via regex: $DEVICE"
fi

echo ""
echo "Number of lines in output: $(echo "$DEVICE_OUTPUT" | wc -l)"
echo "Number of devices found:   $(echo "$DEVICE_OUTPUT" | grep -c '/dev/' || echo 0)"

section "Step 3: Credential creation (fido2-cred -M -h)"

# Generate a dummy clientDataHash (32 bytes, hex-encoded)
CLIENT_DATA_HASH=$(openssl rand -hex 32)
RP_ID="test.example.com"
USER_NAME="testuser"
USER_ID=$(echo -n "testuser-id-12345" | xxd -p | tr -d '\n')

echo "Test parameters:"
echo "  clientDataHash: $CLIENT_DATA_HASH"
echo "  rpId:           $RP_ID"
echo "  userName:       $USER_NAME"
echo "  userId (hex):   $USER_ID"
echo ""

# Build stdin input
CRED_INPUT="${CLIENT_DATA_HASH}
${RP_ID}
${USER_NAME}
${USER_ID}
"

echo "--- Testing WITHOUT PIN (fido2-cred -M -h $DEVICE) ---"
echo ""
echo "Touch your security key when it blinks..."
echo ""

# Try without -v first (no PIN, no user verification)
CRED_STDOUT="$TMPDIR/cred_stdout.txt"
CRED_STDERR="$TMPDIR/cred_stderr.txt"

if echo "$CRED_INPUT" | fido2-cred -M -h "$DEVICE" > "$CRED_STDOUT" 2> "$CRED_STDERR"; then
  ok "fido2-cred succeeded without PIN"
  CRED_USED_PIN=false
else
  EXIT_CODE=$?
  warn "fido2-cred without PIN failed (exit code $EXIT_CODE)"
  echo "stderr: $(cat "$CRED_STDERR")"
  echo ""

  # If it needs a PIN, the user will need to enter it
  echo "--- Retrying WITH PIN (fido2-cred -M -h -v $DEVICE) ---"
  echo ""
  echo "You will be prompted for your security key PIN."
  echo "Then touch your key when it blinks."
  echo ""

  if echo "$CRED_INPUT" | fido2-cred -M -h -v "$DEVICE" > "$CRED_STDOUT" 2> "$CRED_STDERR"; then
    ok "fido2-cred succeeded with PIN"
    CRED_USED_PIN=true
  else
    EXIT_CODE=$?
    fail "fido2-cred failed (exit code $EXIT_CODE)"
    echo "stderr: $(cat "$CRED_STDERR")"
    echo ""
    echo "This might mean:"
    echo "  - Wrong PIN entered"
    echo "  - Key doesn't support the requested operation"
    echo "  - Key needs a firmware update"
    echo ""
    echo "Please include the stderr output above when reporting results."
    exit 1
  fi
fi

echo ""

CRED_LINES=$(wc -l < "$CRED_STDOUT")
echo "Number of output lines: $CRED_LINES"
echo ""

# NOTE: We intentionally do NOT dump raw fido2-cred output here.
# The x509 attestation certificate (line 3) can fingerprint the specific
# hardware key (model, batch, sometimes serial). The line-by-line analysis
# below shows enough to validate format without exposing sensitive material.

echo "stderr during credential creation (PIN prompt format only):"
echo "---"
# Only show the PIN prompt line, not any other stderr content
grep -i "pin" "$CRED_STDERR" 2>/dev/null || echo "(no PIN-related output)"
echo "---"
echo ""

# Analyse each line
echo "Line-by-line analysis (our plan expects: format, authData, x509cert, signature, [credId]):"
echo ""

LINE_NUM=0
while IFS= read -r line; do
  LINE_NUM=$((LINE_NUM + 1))
  LINE_LEN=${#line}

  # Check if it looks like base64
  if echo "$line" | base64 -d >/dev/null 2>&1; then
    DECODED_LEN=$(echo "$line" | base64 -d | wc -c)
    IS_BASE64="yes (decodes to $DECODED_LEN bytes)"
  else
    IS_BASE64="no"
  fi

  case $LINE_NUM in
    1) EXPECTED="format string (e.g. 'packed', 'none')" ;;
    2) EXPECTED="authenticator data (base64)" ;;
    3) EXPECTED="x509 certificate (base64)" ;;
    4) EXPECTED="signature (base64)" ;;
    5) EXPECTED="credential ID (base64)" ;;
    *) EXPECTED="unexpected extra line" ;;
  esac

  echo "  Line $LINE_NUM: length=$LINE_LEN, base64=$IS_BASE64"
  echo "    Expected: $EXPECTED"
  echo "    Preview:  ${line:0:16}... (truncated, not safe to share full value)"
  echo ""
done < "$CRED_STDOUT"

# Extract credential ID for the assertion test
if [[ "$CRED_LINES" -ge 5 ]]; then
  CRED_ID_B64=$(sed -n '5p' "$CRED_STDOUT")
  ok "Credential ID found on line 5"
else
  warn "No credential ID on line 5 (only $CRED_LINES lines). Plan's fallback parsing from authData will be needed."
  CRED_ID_B64=""
fi

section "Step 4: Assertion (fido2-assert -G -h)"

# New challenge for assertion
ASSERT_HASH=$(openssl rand -hex 32)

echo "Test parameters:"
echo "  clientDataHash: $ASSERT_HASH"
echo "  rpId:           $RP_ID"

ASSERT_INPUT="${ASSERT_HASH}
${RP_ID}
"

# If we have a credential ID, add it
if [[ -n "$CRED_ID_B64" ]]; then
  CRED_ID_HEX=$(echo "$CRED_ID_B64" | base64 -d | xxd -p | tr -d '\n')
  ASSERT_INPUT="${ASSERT_HASH}
${RP_ID}
${CRED_ID_HEX}
"
  echo "  credId:         present (${#CRED_ID_HEX} hex chars, not shown)"
fi
echo ""

ASSERT_STDOUT="$TMPDIR/assert_stdout.txt"
ASSERT_STDERR="$TMPDIR/assert_stderr.txt"

if [[ "$CRED_USED_PIN" = true ]]; then
  echo "--- Testing WITH PIN (fido2-assert -G -h -v $DEVICE) ---"
  echo ""
  echo "Enter your PIN again, then touch your key."
  echo ""

  if echo "$ASSERT_INPUT" | fido2-assert -G -h -v "$DEVICE" > "$ASSERT_STDOUT" 2> "$ASSERT_STDERR"; then
    ok "fido2-assert succeeded"
  else
    EXIT_CODE=$?
    fail "fido2-assert failed (exit code $EXIT_CODE)"
    echo "stderr: $(cat "$ASSERT_STDERR")"
    echo ""
    echo "This is still useful data — please include all output when reporting."
    # Don't exit, show what we have
  fi
else
  echo "--- Testing WITHOUT PIN (fido2-assert -G -h $DEVICE) ---"
  echo ""
  echo "Touch your security key when it blinks..."
  echo ""

  if echo "$ASSERT_INPUT" | fido2-assert -G -h "$DEVICE" > "$ASSERT_STDOUT" 2> "$ASSERT_STDERR"; then
    ok "fido2-assert succeeded"
  else
    EXIT_CODE=$?
    warn "fido2-assert without PIN failed (exit code $EXIT_CODE), retrying with PIN..."
    echo ""

    if echo "$ASSERT_INPUT" | fido2-assert -G -h -v "$DEVICE" > "$ASSERT_STDOUT" 2> "$ASSERT_STDERR"; then
      ok "fido2-assert succeeded with PIN"
    else
      EXIT_CODE=$?
      fail "fido2-assert failed (exit code $EXIT_CODE)"
      echo "stderr: $(cat "$ASSERT_STDERR")"
    fi
  fi
fi

echo ""

ASSERT_LINES=$(wc -l < "$ASSERT_STDOUT")
echo "Number of output lines: $ASSERT_LINES"
echo ""

# NOTE: Same as above — do not dump raw assertion output.
# The signature and authenticator data are bound to a dummy RP and random
# challenge, but there's no reason to expose them publicly.

echo "stderr during assertion (PIN prompt format only):"
echo "---"
grep -i "pin" "$ASSERT_STDERR" 2>/dev/null || echo "(no PIN-related output)"
echo "---"
echo ""

echo "Line-by-line analysis (our plan expects: authData, signature, [credId], [userHandle]):"
echo ""

LINE_NUM=0
while IFS= read -r line; do
  LINE_NUM=$((LINE_NUM + 1))
  LINE_LEN=${#line}

  if echo "$line" | base64 -d >/dev/null 2>&1; then
    DECODED_LEN=$(echo "$line" | base64 -d | wc -c)
    IS_BASE64="yes (decodes to $DECODED_LEN bytes)"
  else
    IS_BASE64="no"
  fi

  case $LINE_NUM in
    1) EXPECTED="authenticator data (base64)" ;;
    2) EXPECTED="signature (base64)" ;;
    3) EXPECTED="credential ID (base64)" ;;
    4) EXPECTED="user handle (base64)" ;;
    *) EXPECTED="unexpected extra line" ;;
  esac

  echo "  Line $LINE_NUM: length=$LINE_LEN, base64=$IS_BASE64"
  echo "    Expected: $EXPECTED"
  echo "    Preview:  ${line:0:16}... (truncated)"
  echo ""
done < "$ASSERT_STDOUT"

section "Step 5: PIN prompt detection"
echo "Checking stderr output for PIN prompt format..."
echo ""

for f in "$CRED_STDERR" "$ASSERT_STDERR"; do
  FNAME=$(basename "$f")
  # Only check for the PIN prompt pattern, don't dump full stderr
  # (stderr may contain device paths or other identifying info)
  PIN_LINE=$(grep -i "pin" "$f" 2>/dev/null || true)
  if [[ -n "$PIN_LINE" ]]; then
    echo "  $FNAME contains PIN prompt: yes"
    if echo "$PIN_LINE" | grep -q "Enter PIN for"; then
      ok "PIN prompt matches expected pattern: 'Enter PIN for /dev/...'"
    else
      warn "PIN prompt does NOT match 'Enter PIN for' — plan's detection logic may need adjustment"
      echo "    Pattern found: $(echo "$PIN_LINE" | sed 's|/dev/[^ ]*|/dev/[REDACTED]|g')"
    fi
    echo ""
  fi
done

if [[ "$CRED_USED_PIN" = false ]]; then
  warn "Key did not require PIN, so PIN prompt format was not tested."
  echo "  If you have a PIN-protected key, set a PIN with: fido2-token -S $DEVICE"
fi

section "Summary"

echo "fido2-tools version:     $(fido2-token -V 2>&1 || echo 'unknown')"
echo "Device:                  $DEVICE"
echo "PIN required:            $CRED_USED_PIN"
echo "fido2-cred output lines: $CRED_LINES (plan expects 4-5)"
echo "fido2-assert output lines: $ASSERT_LINES (plan expects 2-4)"
echo ""

ISSUES=0
if [[ "$CRED_LINES" -lt 4 ]]; then
  fail "fido2-cred produced fewer than 4 lines — plan's parsing will break"
  ISSUES=$((ISSUES + 1))
fi
if [[ "$ASSERT_LINES" -lt 2 ]]; then
  fail "fido2-assert produced fewer than 2 lines — plan's parsing will break"
  ISSUES=$((ISSUES + 1))
fi
if [[ "$CRED_LINES" -gt 5 ]]; then
  warn "fido2-cred produced more than 5 lines — extra lines may need investigation"
  ISSUES=$((ISSUES + 1))
fi
if [[ "$ASSERT_LINES" -gt 4 ]]; then
  warn "fido2-assert produced more than 4 lines — extra lines may need investigation"
  ISSUES=$((ISSUES + 1))
fi

if [[ "$ISSUES" -eq 0 ]]; then
  echo -e "${GREEN}All output format assumptions validated successfully.${NC}"
else
  echo -e "${YELLOW}$ISSUES issue(s) found — see details above.${NC}"
fi

echo ""
echo "Please copy everything above and paste it into a comment on PR #2327."
echo "Thank you for helping validate this!"
