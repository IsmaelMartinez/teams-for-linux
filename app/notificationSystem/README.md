# Custom Notification System

Custom in-app toast notifications as an alternative to OS-level notifications.

## Components

- **CustomNotificationManager** - Coordinates toast display, handles IPC channel `notification-show-toast`
- **NotificationToast** - BrowserWindow wrapper, manages individual notification lifecycle
- **notificationToast.html** - Toast UI with Teams design language

## Supported Notification Types (Phase 2)

The custom notification system handles all Teams notification types:

- **Meeting notifications** - Meeting started, join reminders
- **Chat notifications** - Private and group chat messages
- **Calendar notifications** - Meeting invitations, event reminders
- **Activity notifications** - Mentions, reactions, replies

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Renderer Process                          │
│                                                              │
│  ┌─────────────────┐    ┌─────────────────────────────────┐ │
│  │  preload.js     │    │  activityHub.js                 │ │
│  │  (Notification  │    │  (Teams event detection)        │ │
│  │   override)     │    │                                 │ │
│  └────────┬────────┘    └──────────────┬──────────────────┘ │
│           │                            │                     │
│           ▼                            ▼                     │
│  ┌─────────────────────────────────────────────────────────┐│
│  │  activityManager.js                                     ││
│  │  (Routes notifications through IPC)                     ││
│  └────────────────────────────┬────────────────────────────┘│
└───────────────────────────────┼──────────────────────────────┘
                                │
                    notification-show-toast IPC
                                │
┌───────────────────────────────▼──────────────────────────────┐
│                     Main Process                              │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  CustomNotificationManager                              │ │
│  │  ├── Receives notification data via IPC                │ │
│  │  └── Creates NotificationToast windows                  │ │
│  └─────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────┘
```

## IPC Channels

| Channel | Type | Purpose |
|---------|------|---------|
| `notification-show-toast` | Event | Request to display a toast notification |
| `notification-toast-click` | Event | User clicked on a toast |

## Configuration

```json
{
  "notificationMethod": "custom",
  "customNotification": {
    "toastDuration": 5000
  }
}
```

## Related Modules

- `app/browser/tools/activityHub.js` - Detects Teams notification events
- `app/browser/tools/notificationObserver.js` - Additional notification observation
- `app/browser/notifications/activityManager.js` - Routes notifications to custom system

## Implementation Details

- Follows `IncomingCallToast` pattern for consistency
- Uses `electron-positioner` for multi-monitor support
- Keeps active toasts in memory to prevent garbage collection
- Toast appears in bottom-right corner with auto-dismiss
- Deduplication prevents duplicate notifications
