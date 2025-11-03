# Notifications Plugin Preload API

The notifications plugin provides a secure bridge between the renderer process and the main process for handling system notifications in Microsoft Teams for Linux.

## Overview

The preload script exposes the `window.teamsNotifications` API that provides methods to:
- Show system notifications
- Manage notification permissions
- Handle notification events (shown, clicked, closed, failed)
- Control badge counts and sound settings

## API Reference

### window.teamsNotifications

All methods are available through the `window.teamsNotifications` namespace in the renderer process.

---

### Methods

#### `show(notification)`

Show a system notification.

**Parameters:**
- `notification` (Object) - Notification options
  - `title` (string, required) - Notification title (max 500 chars)
  - `body` (string, optional) - Notification body (max 2000 chars)
  - `icon` (string, optional) - Icon URL or path (max 1000 chars)
  - `tag` (string, optional) - Tag for grouping notifications (max 100 chars)
  - `urgency` (string, optional) - One of: 'low', 'normal', 'critical'
  - `silent` (boolean, optional) - Disable notification sound
  - `data` (Object, optional) - Custom data payload (must be JSON-serializable, max 10KB)

**Returns:** `Promise<string>` - Notification ID

**Example:**
```javascript
const notificationId = await window.teamsNotifications.show({
  title: 'New Message',
  body: 'John Doe sent you a message',
  icon: '/path/to/icon.png',
  tag: 'chat-message',
  urgency: 'normal',
  data: { chatId: '123', userId: '456' }
});

console.log('Notification shown with ID:', notificationId);
```

---

#### `requestPermission()`

Request notification permission from the system.

**Returns:** `Promise<string>` - Permission status: 'granted', 'denied', or 'default'

**Example:**
```javascript
const permission = await window.teamsNotifications.requestPermission();
console.log('Notification permission:', permission);
```

---

#### `getPermission()`

Get current notification permission status.

**Returns:** `Promise<string>` - Permission status: 'granted', 'denied', or 'default'

**Example:**
```javascript
const permission = await window.teamsNotifications.getPermission();
if (permission === 'granted') {
  // Show notifications
}
```

---

#### `clearAll()`

Clear all active notifications.

**Returns:** `Promise<void>`

**Example:**
```javascript
await window.teamsNotifications.clearAll();
```

---

#### `setBadgeCount(count)`

Set the application badge count.

**Parameters:**
- `count` (number) - Badge count (0-9999)

**Returns:** `Promise<void>`

**Example:**
```javascript
await window.teamsNotifications.setBadgeCount(5);
```

---

#### `getBadgeCount()`

Get current badge count.

**Returns:** `Promise<number>` - Current badge count

**Example:**
```javascript
const count = await window.teamsNotifications.getBadgeCount();
console.log('Badge count:', count);
```

---

#### `setSoundEnabled(enabled)`

Enable or disable notification sounds.

**Parameters:**
- `enabled` (boolean) - Enable or disable sound

**Returns:** `Promise<void>`

**Example:**
```javascript
await window.teamsNotifications.setSoundEnabled(false);
```

---

#### `getActiveCount()`

Get number of active notifications.

**Returns:** `Promise<number>` - Active notification count

**Example:**
```javascript
const count = await window.teamsNotifications.getActiveCount();
console.log('Active notifications:', count);
```

---

### Event Handlers

#### `onShown(callback)`

Register event handler for when a notification is shown.

**Parameters:**
- `callback` (Function) - Handler function receiving notification data

**Returns:** `Function` - Unsubscribe function

**Example:**
```javascript
const unsubscribe = window.teamsNotifications.onShown((data) => {
  console.log('Notification shown:', data);
});

// Later, to unsubscribe
unsubscribe();
```

---

#### `onClicked(callback)`

Register event handler for when a notification is clicked.

**Parameters:**
- `callback` (Function) - Handler function receiving click event data

**Returns:** `Function` - Unsubscribe function

**Example:**
```javascript
const unsubscribe = window.teamsNotifications.onClicked((data) => {
  console.log('Notification clicked:', data);
  // Navigate to chat or perform action based on data
});
```

---

#### `onClosed(callback)`

Register event handler for when a notification is closed.

**Parameters:**
- `callback` (Function) - Handler function receiving close event data

**Returns:** `Function` - Unsubscribe function

**Example:**
```javascript
const unsubscribe = window.teamsNotifications.onClosed((data) => {
  console.log('Notification closed:', data);
});
```

---

#### `onFailed(callback)`

Register event handler for when a notification fails.

**Parameters:**
- `callback` (Function) - Handler function receiving error information

**Returns:** `Function` - Unsubscribe function

**Example:**
```javascript
const unsubscribe = window.teamsNotifications.onFailed((error) => {
  console.error('Notification failed:', error);
});
```

---

#### `removeAllListeners()`

Remove all registered event listeners.

**Returns:** `void`

**Example:**
```javascript
window.teamsNotifications.removeAllListeners();
```

---

## Custom Events

### `badge-count-updated`

Fired when the badge count is updated.

**Event Detail:**
- `count` (number) - New badge count

**Example:**
```javascript
window.addEventListener('badge-count-updated', (event) => {
  console.log('Badge count updated:', event.detail.count);
});
```

---

## Security & Validation

The preload script implements several security measures:

1. **Input Validation**: All inputs are validated for type and format
2. **Length Limits**: String fields are truncated to prevent abuse
3. **Data Sanitization**: All data is sanitized before sending to main process
4. **Serialization Checks**: Data payloads must be JSON-serializable
5. **Size Limits**: Data payloads are limited to 10KB

### Validation Rules

- **title**: Required, max 500 characters
- **body**: Optional, max 2000 characters
- **icon**: Optional, max 1000 characters
- **tag**: Optional, max 100 characters
- **urgency**: Must be one of: 'low', 'normal', 'critical'
- **data**: Must be serializable object, max 10KB
- **badge count**: Must be number between 0-9999

---

## IPC Channels

The preload script uses the following IPC channels:

### Invoke (Renderer → Main)
- `plugin:notification:show`
- `plugin:notification:request-permission`
- `plugin:notification:get-permission`
- `plugin:notification:clear-all`
- `plugin:notification:set-badge-count`
- `plugin:notification:get-badge-count`
- `plugin:notification:set-sound-enabled`
- `plugin:notification:get-active-count`

### Events (Main → Renderer)
- `notification:shown`
- `notification:clicked`
- `notification:closed`
- `notification:failed`
- `notification:badge-updated`

---

## Usage Examples

### Complete Example

```javascript
// Initialize notification handling
async function initializeNotifications() {
  // Check permission
  const permission = await window.teamsNotifications.getPermission();
  if (permission !== 'granted') {
    await window.teamsNotifications.requestPermission();
  }

  // Set up event handlers
  window.teamsNotifications.onClicked((data) => {
    console.log('User clicked notification:', data);
    // Navigate to relevant content
    if (data.chatId) {
      navigateToChat(data.chatId);
    }
  });

  window.teamsNotifications.onFailed((error) => {
    console.error('Notification failed:', error);
  });

  // Listen for badge count updates
  window.addEventListener('badge-count-updated', (event) => {
    updateUIBadge(event.detail.count);
  });
}

// Show a notification
async function showChatNotification(message) {
  try {
    const notificationId = await window.teamsNotifications.show({
      title: `${message.sender.name} sent a message`,
      body: message.text,
      icon: message.sender.avatar,
      tag: `chat-${message.chatId}`,
      urgency: message.priority === 'high' ? 'critical' : 'normal',
      data: {
        chatId: message.chatId,
        messageId: message.id,
        senderId: message.sender.id
      }
    });

    console.log('Notification shown:', notificationId);
  } catch (error) {
    console.error('Failed to show notification:', error);
  }
}

// Update badge count
async function updateUnreadCount(count) {
  try {
    await window.teamsNotifications.setBadgeCount(count);
  } catch (error) {
    console.error('Failed to update badge count:', error);
  }
}
```

---

## Notes

- Since `contextIsolation` is set to `false` in the application, the API has direct access to the DOM
- The preload script provides a cleaner API interface rather than strict security isolation
- All IPC communication is handled through validated channels
- Event handlers support multiple subscriptions and can be unsubscribed individually
- Data payloads should be kept minimal for performance

---

## Related Files

- **Preload Script**: `/app/plugins/core/notifications/preload.js`
- **Main Process Service**: `/app/domains/teams-integration/services/NotificationInterceptor.js`
- **Tests**: `/tests/plugins/core/notifications/preload.test.js`
