/**
 * Notification Observer Module
 *
 * Observes Teams' internal notification events to capture chat and calendar
 * notifications that may bypass the browser Notification API.
 *
 * This module works alongside the Notification override in preload.js to
 * ensure all notification types are routed through the custom notification system.
 */

const ReactHandler = require('./reactHandler');

class NotificationObserver {
  #ipcRenderer = null;
  #config = null;
  #observing = false;
  #checkInterval = null;
  #lastNotificationIds = new Set();
  #notificationService = null;
  #setupAttempts = 0;
  #maxSetupAttempts = 30; // Try for up to 5 minutes (30 * 10s)

  /**
   * Initialize the notification observer
   * @param {object} config - Application configuration
   * @param {object} ipcRenderer - Electron IPC renderer
   */
  init(config, ipcRenderer) {
    this.#config = config;
    this.#ipcRenderer = ipcRenderer;

    // Only run in custom notification mode
    if (config.notificationMethod !== 'custom') {
      console.debug('[NotificationObserver] Not in custom mode, skipping initialization');
      return;
    }

    console.debug('[NotificationObserver] Initializing...');
    this.#startObservingWhenReady();
  }

  /**
   * Start observing when Teams' React services are ready
   */
  #startObservingWhenReady() {
    const trySetup = () => {
      this.#setupAttempts++;

      if (this.#setupAttempts > this.#maxSetupAttempts) {
        console.warn('[NotificationObserver] Max setup attempts reached, stopping');
        if (this.#checkInterval) {
          clearInterval(this.#checkInterval);
          this.#checkInterval = null;
        }
        return;
      }

      const notificationService = this.#getTeamsNotificationService();
      if (notificationService) {
        this.#notificationService = notificationService;
        this.#observeNotificationService();
        if (this.#checkInterval) {
          clearInterval(this.#checkInterval);
          this.#checkInterval = null;
        }
        console.debug('[NotificationObserver] Setup complete after', this.#setupAttempts, 'attempts');
      } else {
        console.debug('[NotificationObserver] Teams notification service not ready, attempt', this.#setupAttempts);
      }
    };

    // Initial check
    trySetup();

    // Retry periodically if not ready
    if (!this.#notificationService) {
      this.#checkInterval = setInterval(trySetup, 10000);
    }
  }

  /**
   * Get Teams' internal notification service from React internals
   * @returns {object|null} The notification service or null
   */
  #getTeamsNotificationService() {
    try {
      const coreServices = ReactHandler._getTeams2CoreServices?.() ||
                           this.#getCoreServicesDirectly();

      if (!coreServices) {
        return null;
      }

      // Log available services for debugging (first time only)
      if (this.#setupAttempts === 1) {
        const serviceKeys = Object.keys(coreServices).filter(k =>
          k.toLowerCase().includes('notif') ||
          k.toLowerCase().includes('toast') ||
          k.toLowerCase().includes('alert') ||
          k.toLowerCase().includes('activity')
        );
        console.debug('[NotificationObserver] Potential notification services:', serviceKeys);
      }

      // Try to find notification-related services
      const possibleServices = [
        'notificationService',
        'notificationsService',
        'toastNotificationService',
        'activityNotificationService',
        'systemNotificationService',
        'chatNotificationService',
        'calendarNotificationService'
      ];

      for (const serviceName of possibleServices) {
        if (coreServices[serviceName]) {
          console.debug('[NotificationObserver] Found service:', serviceName);
          return coreServices[serviceName];
        }
      }

      // Also check for notification-related observables in other services
      const commandService = coreServices.commandChangeReportingService;
      if (commandService) {
        console.debug('[NotificationObserver] Using commandChangeReportingService');
        return { type: 'command', service: commandService };
      }

      return null;
    } catch (error) {
      console.debug('[NotificationObserver] Error getting notification service:', error.message);
      return null;
    }
  }

  /**
   * Get core services directly if ReactHandler method is private
   */
  #getCoreServicesDirectly() {
    try {
      const appElement = document.getElementById('app');
      if (!appElement) return null;

      const internalRoot = appElement._reactRootContainer?._internalRoot ||
                          appElement._reactRootContainer;
      if (!internalRoot) return null;

      const coreProps = internalRoot.current?.updateQueue?.baseState?.element?.props;
      return coreProps?.coreServices || coreProps?.children?.props?.coreServices;
    } catch (error) {
      return null;
    }
  }

  /**
   * Start observing the notification service
   */
  #observeNotificationService() {
    if (this.#observing) return;
    this.#observing = true;

    try {
      if (this.#notificationService?.type === 'command') {
        this.#observeCommandChanges(this.#notificationService.service);
      } else if (typeof this.#notificationService?.subscribe === 'function') {
        this.#observeNotificationSubscription();
      } else if (typeof this.#notificationService?.observeChanges === 'function') {
        this.#observeNotificationChanges();
      } else {
        // Fallback: poll for notifications
        console.debug('[NotificationObserver] Using polling fallback');
        this.#startPolling();
      }
    } catch (error) {
      console.error('[NotificationObserver] Error starting observation:', error);
      this.#observing = false;
    }
  }

  /**
   * Observe command changes for notification events
   * @param {object} commandService - The command reporting service
   */
  #observeCommandChanges(commandService) {
    console.debug('[NotificationObserver] Observing command changes');

    try {
      commandService.observeChanges().subscribe((event) => {
        this.#handleCommandEvent(event);
      });
    } catch (error) {
      console.error('[NotificationObserver] Error subscribing to command changes:', error);
    }
  }

  /**
   * Handle command change events from Teams
   * @param {object} event - The command event
   */
  #handleCommandEvent(event) {
    try {
      // Log all events for debugging (can be removed once stable)
      const eventContext = event?.context;
      if (!eventContext) return;

      // Look for notification-related commands
      const command = eventContext.entityCommand || eventContext.command;
      const step = eventContext.step;
      const target = eventContext.target;

      // Chat message notifications
      if (this.#isChatNotificationEvent(event)) {
        this.#handleChatNotification(event);
      }

      // Calendar/meeting invite notifications
      if (this.#isCalendarNotificationEvent(event)) {
        this.#handleCalendarNotification(event);
      }

      // Activity notifications (reactions, mentions, etc.)
      if (this.#isActivityNotificationEvent(event)) {
        this.#handleActivityNotification(event);
      }

    } catch (error) {
      console.debug('[NotificationObserver] Error handling command event:', error.message);
    }
  }

  /**
   * Check if event is a chat notification
   */
  #isChatNotificationEvent(event) {
    const context = event?.context;
    if (!context) return false;

    const indicators = [
      context.step?.toLowerCase().includes('message'),
      context.step?.toLowerCase().includes('chat'),
      context.entityCommand?.entityOptions?.type === 'message',
      context.entityCommand?.entityOptions?.isChat === true,
      context.target?.includes('chat'),
      context.scenario?.toLowerCase().includes('message'),
      context.scenario?.toLowerCase().includes('chat')
    ];

    return indicators.some(Boolean);
  }

  /**
   * Check if event is a calendar notification
   */
  #isCalendarNotificationEvent(event) {
    const context = event?.context;
    if (!context) return false;

    const indicators = [
      context.step?.toLowerCase().includes('calendar'),
      context.step?.toLowerCase().includes('meeting'),
      context.step?.toLowerCase().includes('invite'),
      context.entityCommand?.entityOptions?.type === 'calendar',
      context.entityCommand?.entityOptions?.type === 'meeting',
      context.entityCommand?.entityOptions?.isMeetingInvite === true,
      context.target?.includes('calendar'),
      context.scenario?.toLowerCase().includes('calendar'),
      context.scenario?.toLowerCase().includes('meeting-invite')
    ];

    return indicators.some(Boolean);
  }

  /**
   * Check if event is an activity notification (mentions, reactions, etc.)
   */
  #isActivityNotificationEvent(event) {
    const context = event?.context;
    if (!context) return false;

    const indicators = [
      context.step?.toLowerCase().includes('mention'),
      context.step?.toLowerCase().includes('reaction'),
      context.step?.toLowerCase().includes('activity'),
      context.entityCommand?.entityOptions?.isMention === true,
      context.entityCommand?.entityOptions?.isReaction === true
    ];

    return indicators.some(Boolean);
  }

  /**
   * Handle chat notification event
   * @param {object} event - The chat notification event
   */
  #handleChatNotification(event) {
    console.debug('[NotificationObserver] Chat notification detected:', event.type);

    const options = event.context?.entityCommand?.entityOptions || {};
    const notificationData = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      type: 'chat',
      title: options.title || options.senderName || 'New Message',
      body: options.text || options.preview || options.message || '',
      icon: options.mainImage?.src || options.senderImage || options.icon,
      metadata: {
        chatId: options.chatId,
        messageId: options.messageId,
        senderId: options.senderId
      }
    };

    this.#sendCustomNotification(notificationData);
  }

  /**
   * Handle calendar notification event
   * @param {object} event - The calendar notification event
   */
  #handleCalendarNotification(event) {
    console.debug('[NotificationObserver] Calendar notification detected:', event.type);

    const options = event.context?.entityCommand?.entityOptions || {};
    const notificationData = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      type: 'calendar',
      title: options.title || options.subject || 'Meeting Invitation',
      body: options.text || options.organizer || options.time || '',
      icon: options.mainImage?.src || options.icon,
      metadata: {
        meetingId: options.meetingId,
        eventId: options.eventId,
        organizerId: options.organizerId,
        startTime: options.startTime,
        endTime: options.endTime
      }
    };

    this.#sendCustomNotification(notificationData);
  }

  /**
   * Handle activity notification event (mentions, reactions)
   * @param {object} event - The activity notification event
   */
  #handleActivityNotification(event) {
    console.debug('[NotificationObserver] Activity notification detected:', event.type);

    const options = event.context?.entityCommand?.entityOptions || {};
    const notificationData = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      type: 'activity',
      title: options.title || 'Teams Activity',
      body: options.text || options.preview || '',
      icon: options.mainImage?.src || options.icon,
      metadata: {
        activityType: options.activityType
      }
    };

    this.#sendCustomNotification(notificationData);
  }

  /**
   * Send notification through custom notification system
   * @param {object} data - Notification data
   */
  #sendCustomNotification(data) {
    // Deduplicate notifications
    const notificationKey = `${data.type}-${data.title}-${data.body}`;
    if (this.#lastNotificationIds.has(notificationKey)) {
      console.debug('[NotificationObserver] Duplicate notification skipped');
      return;
    }

    // Keep track of recent notifications (clear old ones after 5 seconds)
    this.#lastNotificationIds.add(notificationKey);
    setTimeout(() => {
      this.#lastNotificationIds.delete(notificationKey);
    }, 5000);

    // Send to custom notification system
    if (this.#ipcRenderer && globalThis.electronAPI?.sendNotificationToast) {
      try {
        globalThis.electronAPI.sendNotificationToast(data);
        console.debug('[NotificationObserver] Custom notification sent:', data.title);
      } catch (error) {
        console.error('[NotificationObserver] Failed to send notification:', error);
      }
    }
  }

  /**
   * Start polling for notifications (fallback method)
   */
  #startPolling() {
    // This is a fallback method that periodically checks for new notifications
    // by observing DOM changes or other indicators
    console.debug('[NotificationObserver] Polling mode not implemented - relying on Notification override');
  }

  /**
   * Observe direct notification subscription
   */
  #observeNotificationSubscription() {
    try {
      this.#notificationService.subscribe((notification) => {
        console.debug('[NotificationObserver] Notification received via subscription:', notification);
        this.#processNotification(notification);
      });
    } catch (error) {
      console.error('[NotificationObserver] Error in notification subscription:', error);
    }
  }

  /**
   * Observe notification changes
   */
  #observeNotificationChanges() {
    try {
      this.#notificationService.observeChanges().subscribe((notification) => {
        console.debug('[NotificationObserver] Notification change observed:', notification);
        this.#processNotification(notification);
      });
    } catch (error) {
      console.error('[NotificationObserver] Error observing notification changes:', error);
    }
  }

  /**
   * Process a raw notification object
   * @param {object} notification - The notification object
   */
  #processNotification(notification) {
    if (!notification) return;

    const type = this.#detectNotificationType(notification);
    const notificationData = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      type: type,
      title: notification.title || notification.header || 'Teams Notification',
      body: notification.body || notification.message || notification.content || '',
      icon: notification.icon || notification.image
    };

    this.#sendCustomNotification(notificationData);
  }

  /**
   * Detect the type of notification
   * @param {object} notification - The notification object
   * @returns {string} The notification type
   */
  #detectNotificationType(notification) {
    const typeIndicators = {
      chat: ['message', 'chat', 'conversation'],
      calendar: ['calendar', 'meeting', 'invite', 'event'],
      call: ['call', 'calling', 'ring'],
      activity: ['mention', 'reaction', 'reply', 'like']
    };

    const notificationStr = JSON.stringify(notification).toLowerCase();

    for (const [type, indicators] of Object.entries(typeIndicators)) {
      if (indicators.some(ind => notificationStr.includes(ind))) {
        return type;
      }
    }

    return 'general';
  }
}

module.exports = new NotificationObserver();
