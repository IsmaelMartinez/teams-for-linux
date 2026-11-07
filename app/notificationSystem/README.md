# Custom Notification System

Custom in-app toast notifications as an alternative to OS-level notifications.

## Components

- **CustomNotificationManager** - Coordinates toast display, handles IPC channel `notification-show-toast`
- **NotificationToast** - BrowserWindow wrapper, manages individual notification lifecycle
- **notificationToast.html** - Toast UI with Teams design language; colours and font sizes come from CSS custom properties set from config
- **toastOptions.js** - Resolves `customNotification` config into size, position, margin and style (pure, unit tested)

## IPC Channels

| Channel | Type | Purpose |
|---------|------|---------|
| `notification-show-toast` | Event | Request to display a toast notification |
| `notification-toast-click` | Event | User clicked on a toast |

## Configuration

```json
{
  "notifications": {
    "method": "custom"
  },
  "customNotification": {
    "toastDuration": 5000,
    "width": 360,
    "height": 110,
    "position": "bottomRight",
    "margin": 0,
    "backgroundColor": "#2D2D2D",
    "hoverBackgroundColor": "#3A3A3A",
    "titleColor": "#FFFFFF",
    "textColor": "#D1D1D1",
    "titleFontSize": 14,
    "bodyFontSize": 13
  }
}
```

## Implementation Details

- Follows `IncomingCallToast` pattern for consistency
- Uses `electron-positioner` for multi-monitor support
- Keeps active toasts in memory to prevent garbage collection
- Toast appears in the configured corner (`bottomRight` by default), `margin` pixels from the screen edges, with auto-dismiss
- Style values are checked with `CSS.supports` in the toast page and set as custom properties, so an invalid value keeps the default
