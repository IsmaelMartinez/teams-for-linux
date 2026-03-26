# Virtual FIDO2 Device for Automated WebAuthn Testing

:::info Spike Required
This research proposes using virtual-fido to enable automated WebAuthn/FIDO2 testing without physical hardware security keys. A feasibility spike is needed before any integration work begins.
:::

**Date:** 2026-03-23
**Status:** Research complete, spike pending
**Related:** [#802](https://github.com/IsmaelMartinez/teams-for-linux/issues/802), [PR #2357](https://github.com/IsmaelMartinez/teams-for-linux/pull/2357), [WebAuthn Implementation Plan](webauthn-fido2-implementation-plan.md), [ADR-016](../adr/016-cross-distro-testing-environment.md)

---

## Context

Teams for Linux is adding WebAuthn/FIDO2 hardware security key support (issue #802, PR #2357). The implementation intercepts `navigator.credentials.create()` and `.get()` calls in the Electron renderer process and routes them via IPC to the main process, which shells out to Yubico's `fido2-tools` CLI (`fido2-token`, `fido2-cred`, `fido2-assert`) to communicate with a physical FIDO2 device.

Testing this feature currently requires a real hardware security key. Two community testers have been providing manual validation: rlavriv using a YubiKey and marcovr testing the general flow. While their feedback has been invaluable, the hardware dependency creates a bottleneck. The maintainer cannot iterate on the feature without a physical key plugged in, CI cannot validate the integration automatically, and the cross-distro Docker testing infrastructure at `tests/cross-distro/` cannot exercise the WebAuthn code paths at all since there is no USB device inside a container.

A virtual FIDO2 device that presents itself as real USB hardware to the operating system would close this gap, allowing automated tests to run the full `fido2-tools` pipeline without any physical key.

## virtual-fido Overview

The [virtual-fido](https://github.com/gfhdhytghd/virtual-fido) project creates a software-emulated FIDO2/U2F security key that appears as a real USB device to the host operating system. It works by leveraging Linux's USB/IP subsystem: the `vhci-hcd` kernel module provides a virtual USB host controller, and the `usbip` userspace tools attach virtual devices to it. From the perspective of any USB-aware software, including `fido2-tools`, the virtual device is indistinguishable from a physical YubiKey or similar hardware token.

The project is written in Go and stores credentials locally on the filesystem. It supports both the older U2F protocol and the modern FIDO2/CTAP2 protocol, handles credential creation and assertion operations, and can respond to PIN prompts. When running, it starts a daemon process that registers a virtual USB device with the kernel, at which point `fido2-token -L` will list it alongside any physical devices.

This approach is fundamentally different from Chrome DevTools Protocol (CDP) virtual authenticators, which operate entirely within the browser and bypass the actual hardware communication layer. A CDP authenticator validates that the WebAuthn JavaScript API works, but it never exercises the `fido2-tools` CLI integration, the device discovery logic, or the PIN dialog flow. virtual-fido exercises the entire stack because it creates a real (virtual) USB device that `fido2-tools` talks to through the kernel's USB subsystem.

## Feasibility Analysis

### Kernel Module Requirements

The core dependency is `vhci-hcd`, a Linux kernel module that provides the virtual USB host controller interface for USB/IP. This module is part of the mainline Linux kernel source tree but is not loaded by default on most distributions. It must be either compiled into the kernel or available as a loadable module.

For GitHub Actions runners using `ubuntu-latest`, the full Linux kernel is running on bare metal (not in a VM like Docker Desktop), so `vhci-hcd` is very likely available as a loadable module. Running `modprobe vhci-hcd` should succeed without any additional package installation beyond the `linux-tools-generic` or `linux-modules-extra` package that provides the module file. This makes GitHub Actions the most promising environment for the spike.

Docker Desktop on macOS runs a lightweight Linux VM (based on Alpine/linuxkit) to host the Docker engine. Whether this VM's kernel includes `vhci-hcd` is uncertain. Apple Silicon adds another layer of complexity since the VM already runs under Rosetta 2 emulation for x86_64 containers. The ADR-016 documents that the cross-distro Docker environment works on Apple Silicon for everything except Teams' post-login memory usage, but USB/IP introduces a new kernel-level dependency that may not be present in the Docker Desktop VM kernel. This is the biggest unknown in the feasibility analysis.

For native Linux development machines, `vhci-hcd` availability depends on the distribution's kernel configuration. Ubuntu, Fedora, and Debian all ship it as a loadable module in their default kernels, so `modprobe vhci-hcd` should work out of the box.

### Container Permissions

Running USB/IP inside a Docker container requires elevated privileges. The container needs access to `/sys/devices/platform/vhci_hcd*` and the ability to load kernel modules (or have them pre-loaded on the host). In practice, this means either `--privileged` mode or a combination of `--cap-add SYS_ADMIN` with device access.

The existing cross-distro testing containers already run with `--security-opt seccomp=unconfined` and `--cap-add SYS_ADMIN SYS_PTRACE`, as documented in the cross-distro CI smoke test design. This is a good starting point, though `--privileged` may still be needed for the `vhci-hcd` sysfs interface. The spike will determine the minimal permission set required.

### Build Dependencies

virtual-fido is a Go project, so building it requires a Go toolchain (1.21+). The container would also need the `usbip` userspace tools, which come from `linux-tools-generic` on Ubuntu/Debian or `usbip` on Fedora. These are modest additions to the Dockerfile, though the Go toolchain adds build time and image size. A multi-stage Docker build that compiles virtual-fido in a Go builder stage and copies only the binary to the runtime image would keep the final image lean.

## Integration with Cross-Distro Testing

### Container Architecture

There are two reasonable approaches to integrating virtual-fido into the existing cross-distro Docker setup.

The first approach embeds virtual-fido directly into the existing distro containers. The Dockerfiles would gain a multi-stage Go build step, the `usbip` userspace package, and a startup script modification to launch the virtual-fido daemon before the application starts. This is simpler to manage since there is only one container per configuration, but it couples the FIDO2 testing infrastructure to every container image even when WebAuthn testing is not needed.

The second approach uses a sidecar container that runs virtual-fido and exposes the virtual USB device to the application container via shared kernel access (both containers would need to run on the same host with `vhci-hcd` loaded). This keeps the distro images clean but adds complexity to the `docker-compose.yml` and requires careful orchestration to ensure the virtual device is registered before the application container starts looking for it.

For an initial spike, the embedded approach is simpler and more likely to succeed. If the spike validates the concept, the sidecar approach can be evaluated as a refinement.

### Startup Sequencing

The virtual-fido daemon must start as root (it needs to interact with `vhci-hcd` through sysfs), and it must be running before the application attempts to use `fido2-token -L` for device discovery. In the existing cross-distro containers, the entrypoint script runs as root to set up the display server before switching to a non-root user for the application. The virtual-fido daemon would slot into the root-phase startup, between display server initialization and the user switch.

The startup sequence would look like: load `vhci-hcd` module (if not already loaded on the host), start the virtual-fido daemon in the background, wait for the virtual USB device to appear (polling `fido2-token -L` until it returns a device), then proceed with the normal display server and application startup.

### Automated Test Flow

Once the virtual device is available, an automated test can exercise the full WebAuthn pipeline without any human interaction. The test would run `fido2-token -L` to confirm device detection, then use `fido2-cred -M` to create a credential on the virtual device (providing a relying party ID, user ID, and the device path), and finally use `fido2-assert -G` to generate an assertion for the created credential. Each step validates a different layer of the integration: device discovery, credential creation (which exercises the CTAP2 `authenticatorMakeCredential` command), and assertion generation (which exercises `authenticatorGetAssertion`).

The output format from `fido2-cred` and `fido2-assert` is well-defined (base64-encoded lines containing the attestation object, client data hash, and signature), so the test can validate not just that the commands succeed but that the output is parseable and structurally correct. This is important because the `fido2Backend.js` module in the WebAuthn implementation parses this output to construct the `PublicKeyCredential` response objects that the renderer expects.

## Risks and Unknowns

The biggest risk is `vhci-hcd` availability on Docker Desktop for macOS. If the Docker Desktop Linux VM does not include this module, virtual-fido testing will be limited to native Linux machines and GitHub Actions runners. This is not a dealbreaker since CI is the primary target for automated testing, but it would prevent maintainers on macOS from running FIDO2 tests locally.

virtual-fido itself is a small project with limited community adoption. It has not been widely tested against the full range of CTAP2 features, and its long-term maintenance is uncertain. If the project becomes unmaintained or has bugs in its CTAP2 implementation, we would need to either fork it or find an alternative. The spike should assess code quality and test coverage to gauge this risk.

PIN handling is another area of concern. Real hardware security keys enforce PIN policies (minimum length, retry limits, lockout after too many failures), and Microsoft Entra ID may validate specific PIN-related response fields during authentication. virtual-fido supports PINs, but the behavior may differ from real hardware in subtle ways. For example, virtual-fido might not enforce the 8-attempt retry limit or the `pinUvAuthToken` expiration that real authenticators implement. These differences are acceptable for testing the fido2-tools integration layer (device detection, credential creation, assertion generation) but could cause failures if the tests attempt a full end-to-end authentication flow against Microsoft's servers.

The completeness of virtual-fido's CTAP2 implementation is also unknown. Microsoft Entra ID may require specific extensions or features (such as `credProtect`, `hmac-secret`, or resident key support) that virtual-fido does not implement. The spike should test whether `fido2-cred -M` with the exact parameters that Microsoft's login page sends produces a valid response from the virtual device.

Performance overhead from USB/IP is expected to be negligible for the low-frequency operations involved in FIDO2 authentication (a few USB transactions per create/get operation), but it should be measured during the spike to confirm it does not introduce unexpected timeouts.

## Recommendation

This research recommends pursuing a focused spike to validate the basic feasibility of virtual-fido within the project's testing infrastructure. The spike should answer three specific questions: can `fido2-token -L` detect the virtual device, can `fido2-cred -M` successfully create a credential on it, and can `fido2-assert -G` generate a valid assertion? If all three succeed, virtual-fido is viable for automated testing of the `fido2Backend.js` module.

If the spike succeeds, virtual-fido should be added as an optional test configuration in the cross-distro setup, gated behind an environment variable or Docker Compose profile so that it does not add overhead to test runs that are not exercising WebAuthn. It should supplement, not replace, real hardware testing. The two community testers (rlavriv and marcovr) provide validation against real Microsoft Entra ID authentication flows and real hardware quirks that a virtual device cannot replicate. virtual-fido's value is in enabling fast iteration and CI coverage for the integration layer, not in replacing end-to-end human testing.

If the spike fails (most likely due to `vhci-hcd` unavailability on the target environment), the fallback is to continue with manual hardware testing and consider CDP virtual authenticators for unit-level testing of the JavaScript WebAuthn override layer, accepting that the `fido2-tools` integration layer will remain untested in CI.

## Spike Plan

### Location

`testing/spikes/spike-virtual-fido/`

The spike directory should contain a standalone Dockerfile, a shell script that builds and runs virtual-fido, and a test script that exercises the three validation steps. No changes to the main application code or the cross-distro Docker setup should be made during the spike.

### Success Criteria

The spike succeeds if all three of the following pass inside a Docker container:

`fido2-token -L` lists the virtual-fido device with a device path (e.g., `/dev/hidraw0`). This confirms that virtual-fido successfully registered a virtual USB HID device via `vhci-hcd` and that `fido2-tools` can discover it through the standard CTAP HID transport.

`fido2-cred -M` creates a credential on the virtual device, producing base64-encoded attestation output. The command should be invoked with parameters matching what the `fido2Backend.js` module sends: an `es256` algorithm, a relying party ID, and a user handle.

`fido2-assert -G` generates an assertion using the credential created in the previous step, producing base64-encoded signature output. This confirms that the credential stored by virtual-fido is retrievable and that the assertion flow works end-to-end.

### Environment Priority

The spike should be attempted first on a native Linux machine or in a GitHub Actions runner, where `vhci-hcd` availability is most likely. If that succeeds, attempt the same on Docker Desktop for macOS to determine whether local development testing is feasible. Document the results for each environment.

### Spike Outputs

The spike should produce a brief results document appended to this research file, recording which environments succeeded or failed, any permission or configuration adjustments that were needed, and a recommendation on whether to proceed with full integration.

## References

- [virtual-fido](https://github.com/gfhdhytghd/virtual-fido) — Go-based virtual FIDO2/U2F USB device
- [fido2-tools manuals](https://developers.yubico.com/libfido2/Manuals/) — Yubico libfido2 CLI documentation
- [Cross-Distro Testing ADR (016)](../adr/016-cross-distro-testing-environment.md) — Docker-based testing environment architecture
- [WebAuthn/FIDO2 Implementation Plan](webauthn-fido2-implementation-plan.md) — Full implementation plan for hardware security key support
- [Cross-Distro CI Smoke Test Design](cross-distro-ci-smoke-test-design.md) — CI integration for cross-distro testing
- [Issue #802](https://github.com/IsmaelMartinez/teams-for-linux/issues/802) — Original feature request for security key support
- [PR #2357](https://github.com/IsmaelMartinez/teams-for-linux/pull/2357) — WebAuthn implementation PR
