FROM debian:bookworm

ARG DEBIAN_FRONTEND=noninteractive

# Electron/Chromium runtime dependencies + non-root user
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgtk-3-0 libnss3 libxss1 libxtst6 xdg-utils at-spi2-core \
    libasound2 libdrm2 libgbm1 mesa-utils libgl1-mesa-dri \
    libpango-1.0-0 libcairo2 libcups2 libdbus-1-3 libexpat1 \
    libfontconfig1 libgcc-s1 libglib2.0-0 libnspr4 \
    libx11-6 libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 \
    libxdamage1 libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 \
    libxshmfence1 libxkbcommon0 fonts-liberation \
    # X11 display server and window manager
    xvfb openbox x11vnc xterm dbus-x11 \
    # Wayland compositor and tools
    sway foot wayvnc xwayland \
    # noVNC and utilities
    novnc websockify \
    python3 wget curl procps file fuse3 \
    && rm -rf /var/lib/apt/lists/* \
    && useradd -m -s /bin/bash -G audio,video tester \
    && mkdir -p /home/tester/.config /app && chown -R tester:tester /home/tester /app

# Copy scripts and config
COPY scripts/entrypoint.sh /usr/local/bin/entrypoint.sh
COPY scripts/start-x11.sh /usr/local/bin/start-x11.sh
COPY scripts/start-wayland.sh /usr/local/bin/start-wayland.sh
COPY scripts/start-xwayland.sh /usr/local/bin/start-xwayland.sh
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
