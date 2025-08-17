/**
 * Notification IPC Handlers
 * 
 * Handles notification-related IPC events including notification display,
 * sound playback, and badge count management.
 */

/**
 * Notification handlers module
 * 
 * @param {Object} dependencies - Required dependencies
 * @param {Object} dependencies.app - Electron app instance
 * @param {Object} dependencies.player - Audio player instance (NodeSound)
 * @param {Object} dependencies.config - Application configuration object
 * @param {Array} dependencies.notificationSounds - Array of notification sound configurations
 */
function createNotificationHandlers(dependencies) {
  const { app, player, config, notificationSounds } = dependencies;

  const handlers = {
    'show-notification': {
      type: 'handle',
      handler: async (event, options) => {
        console.debug('[Notifications] Showing notification using electron API');
        console.debug(`[Notifications] Type: ${options.type}, Title: ${options.title}`);
        
        // Play notification sound as part of showing notification
        await playNotificationSound(event, {
          type: options.type,
          audio: "default",
          title: options.title,
          body: options.body,
        });
        
        return { success: true, notificationId: Date.now().toString() };
      },
      options: { logArgs: true }
    },

    'play-notification-sound': {
      type: 'handle',
      handler: async (event, options) => {
        console.debug(`[Notifications] Sound => Type: ${options.type}, Audio: ${options.audio}, Title: ${options.title}, Body: ${options.body}`);
        
        // Check if player is available and sounds are enabled
        if (!player || config.disableNotificationSound) {
          console.debug('[Notifications] Sound playback disabled or player unavailable');
          return { success: false, reason: 'Sound disabled or player unavailable' };
        }
        
        try {
          // Find the appropriate sound file
          const soundConfig = notificationSounds.find(sound => sound.type === options.type) 
                             || notificationSounds.find(sound => sound.type === 'new-message'); // Default fallback
          
          if (soundConfig && soundConfig.file) {
            console.debug(`[Notifications] Playing sound: ${soundConfig.file}`);
            await player.play(soundConfig.file);
            return { success: true, soundFile: soundConfig.file };
          } else {
            console.warn(`[Notifications] No sound file found for type: ${options.type}`);
            return { success: false, reason: 'No sound file found' };
          }
        } catch (error) {
          console.error('[Notifications] Failed to play notification sound:', error);
          return { success: false, reason: error.message };
        }
      },
      options: { logArgs: true, logResult: false }
    },

    'set-badge-count': {
      type: 'handle',
      handler: async (event, count) => {
        console.debug(`[Notifications] Setting badge count to '${count}'`);
        
        try {
          app.setBadgeCount(count);
          return { success: true, count };
        } catch (error) {
          console.error('[Notifications] Failed to set badge count:', error);
          return { success: false, reason: error.message };
        }
      },
      options: { logArgs: true }
    },

    'get-badge-count': {
      type: 'handle',
      handler: async (event) => {
        try {
          const count = app.getBadgeCount();
          console.debug(`[Notifications] Current badge count: ${count}`);
          return { success: true, count };
        } catch (error) {
          console.error('[Notifications] Failed to get badge count:', error);
          return { success: false, reason: error.message };
        }
      },
      options: { logResult: true }
    },

    'clear-badge-count': {
      type: 'handle',
      handler: async (event) => {
        console.debug('[Notifications] Clearing badge count');
        
        try {
          app.setBadgeCount(0);
          return { success: true, count: 0 };
        } catch (error) {
          console.error('[Notifications] Failed to clear badge count:', error);
          return { success: false, reason: error.message };
        }
      }
    }
  };

  // Internal helper function
  async function playNotificationSound(event, options) {
    return handlers['play-notification-sound'].handler(event, options);
  }

  return handlers;
}

/**
 * Default notification sound configuration
 */
function getDefaultNotificationSounds(appPath) {
  const path = require('path');
  
  return [
    {
      type: "new-message",
      file: path.join(appPath, "assets/sounds/new_message.wav"),
    },
    {
      type: "meeting-started", 
      file: path.join(appPath, "assets/sounds/meeting_started.wav"),
    },
  ];
}

/**
 * Initialize audio player
 * Returns null if no audio players are found
 */
function initializeAudioPlayer() {
  let player = null;
  
  try {
    const { NodeSound } = require("node-sound");
    player = NodeSound.getDefaultPlayer();
    console.info('[Notifications] Audio player initialized successfully');
  } catch (err) {
    console.warn(`[Notifications] No audio players found. Audio notifications might not work. ${err}`);
  }
  
  return player;
}

/**
 * Example dependencies for documentation
 */
const exampleDependencies = {
  app: {
    setBadgeCount: (count) => { /* Electron app.setBadgeCount */ },
    getBadgeCount: () => { /* Electron app.getBadgeCount */ }
  },
  player: {
    play: (file) => { /* NodeSound player.play */ }
  },
  config: {
    disableNotificationSound: false,
    appPath: '/path/to/app'
  },
  notificationSounds: [
    {
      type: "new-message",
      file: "/path/to/new_message.wav"
    }
  ]
};

module.exports = {
  createNotificationHandlers,
  getDefaultNotificationSounds,
  initializeAudioPlayer,
  
  // Export examples for documentation
  examples: {
    dependencies: exampleDependencies
  }
};