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
RUN mkdir -p /usr/share/novnc && \
    wget -qO- https://github.com/novnc/noVNC/archive/refs/tags/v1.5.0.tar.gz \
    | tar xz --strip-components=1 -C /usr/share/novnc

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
