# Spike: virtual-fido + fido2-tools in Docker

## What this tests

This spike validates whether [virtual-fido](https://github.com/gfhdhytghd/virtual-fido) can create a virtual USB FIDO2 authenticator inside a Docker container that is detectable by [fido2-tools](https://developers.yubico.com/libfido2/) (`fido2-token`, `fido2-cred`, `fido2-assert`). If it can, the spike then exercises the full WebAuthn registration and sign-in flow using the same encoding and input format that `app/webauthn/fido2Backend.js` uses.

The goal is to determine whether this approach could replace the need for a physical security key during automated testing of the teams-for-linux WebAuthn integration.

## How it works

virtual-fido presents a virtual USB HID device via the Linux kernel's USB/IP subsystem (the `vhci-hcd` module). Once attached, the device appears at `/dev/hidrawN` just like a real YubiKey would, making it transparent to fido2-tools.

The test flow mirrors what `fido2Backend.js` does at each step:

1. `fido2-token -L` discovers the virtual device (same as `discoverDevices()`)
2. `fido2-cred -M -h <device>` creates a credential with base64-encoded clientDataHash, rpId, userName, and userId on stdin (same as `createCredential()`)
3. `fido2-assert -G <device>` generates an assertion with base64-encoded clientDataHash, rpId, and credentialId on stdin (same as `getAssertion()`)

All encoding uses standard base64 (not hex, not base64url) for fido2-tools stdin, matching the format validated by community testers.

## Running the spike

```bash
cd testing/spikes/spike-virtual-fido
./run-spike.sh
```

Requirements: Docker Desktop (macOS or Linux host).

The script builds a Docker image (Ubuntu 24.04, fido2-tools, Go, virtual-fido) and runs it with `--privileged` to allow kernel module loading.

## Interpreting results

### All PASS

virtual-fido works as a drop-in virtual authenticator. This means we can use it in CI/CD or local testing to exercise the full fido2-tools flow without a physical security key.

Next steps would be integrating virtual-fido into the E2E test harness.

### FAIL at vhci-hcd module loading (most likely on macOS)

Docker Desktop for macOS uses a minimal LinuxKit kernel that typically does not include the `vhci-hcd` module. This is the most likely outcome when running on macOS.

This means virtual-fido cannot work inside Docker Desktop on macOS because it has no way to present a USB device to the kernel. It does not indicate a problem with virtual-fido itself.

Workarounds to explore:

- Run on a native Linux host or Linux CI runner (GitHub Actions ubuntu runners)
- Use a full Linux VM (Lima, UTM, VirtualBox) instead of Docker Desktop
- Build a custom Docker Desktop kernel with `CONFIG_USBIP_VHCI_HCD=m`
- Consider alternative approaches that don't need a kernel module (e.g., a FIDO2 device emulator that speaks the `/dev/hidraw` protocol directly via CUSE/FUSE)

### FAIL at device detection (virtual-fido starts but fido2-token sees nothing)

virtual-fido started but its virtual USB device was not recognized by fido2-tools. Possible causes include a version mismatch between virtual-fido and the kernel's USB/IP subsystem, or the device not implementing the CTAP HID protocol correctly.

### FAIL at credential creation or assertion

The virtual device was detected but the WebAuthn flow failed. Check the stderr output for specific error messages from fido2-tools. Common issues include encoding mismatches (the test uses standard base64, same as `fido2Backend.js`) or the virtual authenticator not implementing the required CTAP2 commands.

## Test data

The spike uses safe, fake test data only:

- rpId: `test.example.com`
- userName: `testuser@test.example.com`
- userId: 16 random bytes (base64)
- challenge: 32 random bytes per operation

No real Microsoft or Teams credentials are involved.

## Relation to teams-for-linux

The `app/webauthn/fido2Backend.js` module shells out to fido2-tools for WebAuthn operations on Linux. Currently, testing this module requires a physical FIDO2 security key. If this spike succeeds, virtual-fido could serve as a test double for automated testing, allowing the full create/assert flow to be exercised in CI without hardware.

See also: `scripts/test-fido2-assert.sh` for manual testing with a real key, and `docs-site/docs/development/research/webauthn-fido2-implementation-plan.md` for the full implementation plan.
