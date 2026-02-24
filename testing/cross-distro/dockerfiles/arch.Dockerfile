FROM archlinux:latest

# Update and install base dependencies
RUN pacman -Syu --noconfirm && pacman -S --noconfirm \
    # Electron/Chromium runtime dependencies
    gtk3 nss libxss libxtst xdg-utils at-spi2-core \
    alsa-lib libdrm mesa libxkbcommon libxshmfence \
    pango cairo libcups dbus expat fontconfig \
    gcc-libs glib2 nspr libx11 libxcb libxcomposite libxcursor \
    libxdamage libxext libxfixes libxi libxrandr libxrender \
    ttf-liberation \
    # X11 display server and window manager
    xorg-server-xvfb openbox x11vnc xterm dbus \
    # Wayland compositor and tools
    sway foot wayvnc xorg-server-xwayland \
    # Utilities
    python python-websockify \
    wget curl procps-ng file fuse3 \
    && pacman -Scc --noconfirm

# Install noVNC from source (not in official Arch repos)
# SHA256 verified against https://github.com/novnc/noVNC/releases/tag/v1.5.0
RUN mkdir -p /usr/share/novnc && \
    wget -qO /tmp/novnc.tar.gz https://github.com/novnc/noVNC/archive/refs/tags/v1.5.0.tar.gz && \
    echo "6a73e41f98388a5348b7902f54b02d177cb73b7e5eb0a7a0dcf688cc2c79b42a  /tmp/novnc.tar.gz" | sha256sum -c - && \
    tar xzf /tmp/novnc.tar.gz --strip-components=1 -C /usr/share/novnc && \
    rm /tmp/novnc.tar.gz

# Create non-root user for running the app
RUN useradd -m -s /bin/bash -G audio,video tester
RUN mkdir -p /home/tester/.config /app && chown -R tester:tester /home/tester /app

# Copy scripts and config
COPY scripts/entrypoint.sh /usr/local/bin/entrypoint.sh
COPY scripts/start-x11.sh /usr/local/bin/start-x11.sh
COPY scripts/start-wayland.sh /usr/local/bin/start-wayland.sh
COPY scripts/start-xwayland.sh /usr/local/bin/start-xwayland.sh
COPY config/sway-config /home/tester/.config/sway/config
RUN chmod +x /usr/local/bin/*.sh && chown -R tester:tester /home/tester/.config

# noVNC path
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
