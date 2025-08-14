# Teams for Linux Documentation

This directory contains documentation for Teams for Linux, organized for both users and developers.

## User Documentation

### Getting Started
- **[Configuration Guide](configuration.md)** - Complete configuration options and settings
- **[Troubleshooting Guide](knowledge-base.md)** - Common issues and solutions
- **[Multiple Instances](multiple-instances.md)** - Running separate profiles (work/personal)

### Features
- **[Screen Sharing Guide](screen-sharing.md)** - Complete screen sharing implementation and usage
- **[Custom Backgrounds](custom-backgrounds.md)** - Setting up custom video call backgrounds
- **[Certificate Management](certificate.md)** - Custom CA certificate handling
- **[Logging Configuration](log-config.md)** - Customizing application logging

## Developer Documentation
- **[IPC API Reference](ipc-api.md)** - Inter-process communication channels
- **[AI Research](ai-research/)** - Strategic analysis and research documents

## Architecture Overview

```mermaid
graph TD
    subgraph Main Process
        A[app/index.js] --> B(App Configuration)
        A --> C(IPC Main Handlers)
        A --> D(Window Management)
        A --> E(System Integrations)
        A --> F(Cache Management)
        A --> G(Menu Management)
        A --> H(Protocol Handling)
        A --> T(Screen Sharing Core)
    end

    subgraph Configuration Sources
        Q[System Config<br>/etc/teams-for-linux/config.json]
        R[User Config<br>~/.config/teams-for-linux/config.json]
        S[Default Values]
    end

    subgraph Renderer Process
        I[Teams PWA] --> J(IPC Renderer Calls)
        I --> K(Browser Tools)
        I --> L(Notifications)
        I --> M(Custom CSS/Backgrounds)
        K --> U(Screen Share Detection)
    end
    
    subgraph Screen Sharing System
        T --> V[Stream Selector<br>app/streamSelector/]
        T --> W[Screen Sharing Manager<br>app/screenSharing/]
        V --> X[Desktop Capturer<br>Source Selection]
        W --> Y[Preview Window<br>Real-time Thumbnail]
    end

    subgraph External Systems
        N(Operating System)
        O(Microsoft Teams Services)
        P(External Browser)
        Z(Desktop Capture APIs<br>X11/Wayland/DWM)
    end

    Q --> B
    R --> B
    S --> B

    C -- IPC --> J
    J -- IPC --> C

    D -- Controls --> I
    I -- Renders --> D
    D -- Manages --> Y

    E -- Interacts with --> N
    H -- Opens links in --> P

    I -- Communicates with --> O
    A -- Communicates with --> O

    F -- Manages --> N
    M -- Modifies --> I
    
    U -- Triggers --> T
    T -- Uses --> Z
    X -- Queries --> Z
    
    style T fill:#e3f2fd
    style V fill:#e8f5e8
    style W fill:#fff3e0
    style U fill:#f3e5f5
```

## Quick Start

1. **Basic Usage**: Launch with `teams-for-linux`
2. **Configuration**: Create `~/.config/teams-for-linux/config.json` with your settings
3. **Troubleshooting**: Check the [Troubleshooting Guide](knowledge-base.md) for common issues
4. **Multiple Profiles**: Use `--user-data-dir` and `--class` flags for separate instances

## Getting Help

- Review the troubleshooting guide for common issues
- Check configuration options for customization needs
- For development questions, see the IPC API documentation
- Report bugs at https://github.com/IsmaelMartinez/teams-for-linux/issues