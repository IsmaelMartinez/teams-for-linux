# Quick Chat Module

Quick access to chat contacts using People API and deep link navigation.

## Overview

This module provides a lightweight modal for quickly searching contacts and opening chats. It was implemented as an alternative to the originally planned Chat API approach, which was blocked due to API permission limitations.

See [ADR 014](../../docs-site/docs/development/adr/014-quick-chat-deep-link-approach.md) for the decision rationale.

## Features

- **Contact Search**: Search contacts using Microsoft Graph People API
- **Deep Link Navigation**: Click a contact to open chat in Teams
- **Keyboard Navigation**: Arrow keys and Enter for quick access
- **Keyboard Shortcut**: Configurable shortcut to toggle modal (default: Ctrl+Shift+P)

## Architecture

```
app/quickChat/
├── index.js              # QuickChatManager - lifecycle and IPC handling
├── QuickChatModal.js     # Modal window class
├── quickChatModalPreload.js  # Preload script (context bridge)
├── quickChatModal.html   # Modal UI
└── README.md
```

## Configuration

```json
{
  "quickChat": {
    "enabled": true,
    "shortcut": "Ctrl+Shift+P"
  },
  "graphApi": {
    "enabled": true
  }
}
```

**Note**: Graph API must be enabled for contact search to work.

## IPC Channels

| Channel | Type | Description |
|---------|------|-------------|
| `quick-chat:show` | on | Show the modal |
| `quick-chat:hide` | on | Hide the modal |
| `quick-chat:open-chat` | on | Navigate to chat with user |
| `graph-api-search-people` | handle | Search contacts via People API |

## How It Works

1. User triggers modal via keyboard shortcut or menu
2. User types in search box
3. People API returns contacts ranked by interaction frequency
4. User clicks contact or presses Enter
5. Teams navigates to chat with that user via deep link

## Limitations

- No inline message history (Chat API blocked by permissions)
- No inline message sending (must use Teams native UI)
- Page refresh occurs when navigating via deep link
- Requires Graph API to be enabled

## Related

- [ADR 014: Quick Chat Deep Link Approach](../../docs-site/docs/development/adr/014-quick-chat-deep-link-approach.md)
- [Chat Modal Investigation](../../docs-site/docs/development/research/chat-modal-investigation.md)
- [Chat Modal Spike Results](../../docs-site/docs/development/research/chat-modal-spike-results.md)
