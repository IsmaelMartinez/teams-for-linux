FROM debian:bookworm

ARG DEBIAN_FRONTEND=noninteractive
ARG NODE_VERSION=24.14.1
ARG NODE_SHA256=ace9fa104992ed0829642629c46ca7bd7fd6e76278cb96c958c4b387d29658ea

# Electron/Chromium runtime dependencies, X11 (xvfb/openbox/x11vnc) and
# Wayland (sway/wayvnc) display stacks, noVNC + non-root user
RUN apt-get update && apt-get install -y --no-install-recommends \
    at-spi2-core curl dbus-x11 file fonts-liberation foot fuse3 \
    libasound2 libcairo2 libcups2 libdbus-1-3 libdrm2 libexpat1 \
    libfontconfig1 libgbm1 libgcc-s1 libgl1-mesa-dri libglib2.0-0 \
    libgtk-3-0 libnspr4 libnss3 libpango-1.0-0 libx11-6 libx11-xcb1 \
    libxcb1 libxcomposite1 libxcursor1 libxdamage1 libxext6 libxfixes3 \
    libxi6 libxkbcommon0 libxrandr2 libxrender1 libxshmfence1 libxss1 \
    libxtst6 mesa-utils novnc openbox procps python3 sway wayvnc \
    websockify wget x11vnc xdg-utils xterm xvfb xwayland \
    && rm -rf /var/lib/apt/lists/* \
    && useradd -m -s /bin/bash -G audio,video tester \
    && mkdir -p /home/tester/.config /app && chown -R tester:tester /home/tester /app

# Node.js — pinned version via official binary instead of distro packages.
# All cross-distro containers must use the same Node.js/npm to ensure npm ci
# installs identical Electron binaries, which is critical for session cookie
# compatibility between --login and --test runs across distros.
ADD --checksum=sha256:${NODE_SHA256} https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.gz /tmp/node.tar.gz
RUN tar -xz -C /usr/local --strip-components=1 -f /tmp/node.tar.gz \
    && rm /tmp/node.tar.gz

# Copy scripts and config
COPY scripts/entrypoint.sh /usr/local/bin/entrypoint.sh
COPY scripts/start-x11.sh /usr/local/bin/start-x11.sh
COPY scripts/start-wayland.sh /usr/local/bin/start-wayland.sh
COPY scripts/start-xwayland.sh /usr/local/bin/start-xwayland.sh
COPY scripts/run-tests.sh /usr/local/bin/run-tests.sh
COPY scripts/sway-status.sh /usr/local/bin/sway-status.sh
COPY config/sway-config /home/tester/.config/sway/config
RUN chmod +x /usr/local/bin/*.sh && chown -R tester:tester /home/tester/.config

# noVNC path (Debian package installs to /usr/share/novnc)
ENV NOVNC_PATH=/usr/share/novnc

USER tester
WORKDIR /home/tester

# VNC port and noVNC web port
EXPOSE 5900 6080

ENV DISPLAY_SERVER=x11
ENV SCREEN_RESOLUTION=1920x1080x24
ENV VNC_PORT=5900
ENV NOVNC_PORT=6080

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
