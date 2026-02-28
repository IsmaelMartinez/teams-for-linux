FROM fedora:41

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

# Copy scripts and config
COPY scripts/entrypoint.sh /usr/local/bin/entrypoint.sh
COPY scripts/start-x11.sh /usr/local/bin/start-x11.sh
COPY scripts/start-wayland.sh /usr/local/bin/start-wayland.sh
COPY scripts/start-xwayland.sh /usr/local/bin/start-xwayland.sh
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
