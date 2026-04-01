FROM fedora:41

ARG NODE_VERSION=22.22.2
ARG NODE_SHA256=978978a635eef872fa68beae09f0aad0bbbae6757e444da80b570964a97e62a3

# Electron/Chromium runtime dependencies + non-root user
RUN dnf install -y \
    gtk3 nss libXScrnSaver libXtst xdg-utils at-spi2-core \
    alsa-lib libdrm mesa-libgbm mesa-dri-drivers \
    pango cairo cups-libs dbus-libs expat fontconfig \
    libgcc glib2 nspr libX11 libxcb libXcomposite libXcursor \
    libXdamage libXext libXfixes libXi libXrandr libXrender \
    libxshmfence libxkbcommon liberation-fonts-common \
    # X11 display server and window manager
    xorg-x11-server-Xvfb openbox x11vnc xterm dbus-x11 \
    # Wayland compositor and tools
    sway foot wayvnc xorg-x11-server-Xwayland \
    # noVNC and utilities
    novnc python3-websockify \
    python3 wget curl procps-ng file fuse3 \
    && dnf clean all \
    && useradd -m -s /bin/bash -G audio,video tester \
    && mkdir -p /home/tester/.config /app && chown -R tester:tester /home/tester /app

# Node.js — pinned version via official binary instead of distro packages.
# All cross-distro containers must use the same Node.js/npm to ensure npm ci
# installs identical Electron binaries, which is critical for session cookie
# compatibility between --login and --test runs across distros.
RUN curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.gz" -o node.tar.gz \
    && echo "${NODE_SHA256}  node.tar.gz" | sha256sum -c - \
    && tar -xz -C /usr/local --strip-components=1 -f node.tar.gz \
    && rm node.tar.gz

# Copy scripts and config
COPY scripts/entrypoint.sh /usr/local/bin/entrypoint.sh
COPY scripts/start-x11.sh /usr/local/bin/start-x11.sh
COPY scripts/start-wayland.sh /usr/local/bin/start-wayland.sh
COPY scripts/start-xwayland.sh /usr/local/bin/start-xwayland.sh
COPY scripts/run-tests.sh /usr/local/bin/run-tests.sh
COPY scripts/sway-status.sh /usr/local/bin/sway-status.sh
COPY config/sway-config /home/tester/.config/sway/config
RUN chmod +x /usr/local/bin/*.sh && chown -R tester:tester /home/tester/.config

# noVNC path (Fedora package installs to /usr/share/novnc)
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
