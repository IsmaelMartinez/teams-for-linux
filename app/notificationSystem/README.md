# Custom Notification System

Custom in-app toast notifications as an alternative to OS-level notifications. MVP implementation displays temporary notifications in the bottom-right corner with auto-dismiss.

## Architecture

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

## Implementation Notes

- Follows `IncomingCallToast` pattern for consistency
- Uses `electron-positioner` for multi-monitor support
- Simplified MVP: toast only (notification center is Phase 2)
- Keeps active toasts in memory to prevent garbage collection

## Future Enhancements

Phase 2+: notification center, action buttons, queue management, DND integration, type indicators (message/meeting/etc)
