# Custom Notification System

Custom in-app toast notifications as an alternative to OS-level notifications.

## Components

- **CustomNotificationManager** - Coordinates toast display, handles IPC channel `notification-show-toast`
- **NotificationToast** - BrowserWindow wrapper, manages individual notification lifecycle
- **notificationToast.html** - Toast UI with Teams design language

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

## Implementation Details

- Follows `IncomingCallToast` pattern for consistency
- Uses `electron-positioner` for multi-monitor support
- Keeps active toasts in memory to prevent garbage collection
- Toast appears in bottom-right corner with auto-dismiss
