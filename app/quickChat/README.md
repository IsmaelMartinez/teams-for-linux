# Quick Chat Module

Quick access to chat contacts using People API with inline message sending.

## Overview

This module provides a lightweight modal for quickly searching contacts and sending messages. It uses the Microsoft Graph People API for search and inline messaging via Graph API, avoiding the need to navigate the Teams UI.

See [ADR 015](../../docs-site/docs/development/adr/015-quick-chat-inline-messaging.md) for the implementation approach.

## Features

- **Contact Search**: Search contacts using Microsoft Graph People API
- **Inline Messaging**: Send messages directly from the modal via Graph API
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
| `graph-api-search-people` | handle | Search contacts via People API |
| `graph-api-send-chat-message` | handle | Send message to user via Graph API |

## How It Works

1. User triggers modal via keyboard shortcut or menu
2. User types in search box
3. People API returns contacts ranked by interaction frequency
4. User clicks contact to open compose view
5. User types message and sends via Graph API
6. Message is delivered without leaving the modal

## Limitations

- No inline message history (Chat API blocked by permissions)
- Requires Graph API to be enabled
- Requires appropriate Graph API scopes for messaging

## Related

- [ADR 015: Quick Chat Inline Messaging](../../docs-site/docs/development/adr/015-quick-chat-inline-messaging.md)
- [ADR 014: Quick Chat Deep Link Approach](../../docs-site/docs/development/adr/014-quick-chat-deep-link-approach.md)
- [Chat Modal Investigation](../../docs-site/docs/development/research/chat-modal-investigation.md)
- [Chat Modal Spike Results](../../docs-site/docs/development/research/chat-modal-spike-results.md)
