# Notification Service Module

Handles native desktop notifications and notification sounds for Teams.

## NotificationService Class

Manages OS notifications and sound playback based on user status and configuration.

**Dependencies:**
- `soundPlayer` - Audio player instance (NodeSound)
- `config` - Application configuration
- `mainWindow` - Main application window
- `getUserStatus` - Function returning current user status

**IPC Channels:**
- `show-notification` - Display native notification
- `play-notification-sound` - Play notification sound

**Usage:**
```javascript
const getUserStatus = () => userStatus;
const notificationService = new NotificationService(
  player,
  config,
  mainWindow,
  getUserStatus
);
notificationService.initialize();
```

**Sound Playback:**
Sound is controlled by:
- `config.disableNotificationSound` - Global disable
- `config.disableNotificationSoundIfNotAvailable` - Disable when user not available
- Current user status (injected via getUserStatus)

**Notification Types:**
- `new-message` - Plays new_message.wav
- `meeting-started` - Plays meeting_started.wav
