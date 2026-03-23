# Dockerfile for virtual-fido + fido2-tools spike
#
# Tests whether virtual-fido can present a virtual USB FIDO2 device
# that fido2-tools can detect and interact with inside a Docker container.
#
# Requires: Docker Desktop with Linux kernel (macOS host is fine).
# The vhci-hcd kernel module must be available in the Docker VM's kernel.

FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

# Install fido2-tools, usbip utilities, and Go build dependencies.
#
# linux-tools-common provides the userspace usbip binary.
# linux-tools-generic pulls kernel-version-specific tools which won't match
# the Docker VM kernel, so we install only linux-tools-common and hope the
# usbip userspace tool is compatible. If not, we detect and report the issue.
RUN apt-get update && apt-get install -y --no-install-recommends \
    fido2-tools \
    golang-go \
    git \
    ca-certificates \
    kmod \
    usbutils \
    openssl \
    linux-tools-common \
    && rm -rf /var/lib/apt/lists/*

# Build virtual-fido from source.
# The demo binary uses cobra for subcommands: "start" attaches a virtual
# USB FIDO2 device via USB/IP, with interactive approval prompts on stdin.
RUN git clone --depth 1 https://github.com/gfhdhytghd/virtual-fido /opt/virtual-fido \
    && cd /opt/virtual-fido \
    && go build -o /usr/local/bin/virtual-fido ./cmd/demo

# Copy the test script into the container
COPY test-webauthn-flow.sh /opt/test-webauthn-flow.sh
RUN chmod +x /opt/test-webauthn-flow.sh

# The container needs --privileged to load kernel modules and access /dev
ENTRYPOINT ["/opt/test-webauthn-flow.sh"]
