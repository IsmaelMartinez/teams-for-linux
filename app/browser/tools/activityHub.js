const ReactHandler = require("./reactHandler");
const eventHandlers = [];
// Supported events
const supportedEvents = new Set([
  "incoming-call-created",
  "incoming-call-ended",
  "call-connected",
  "call-disconnected",
  "chat-notification",
  "calendar-notification",
  "activity-notification"
]);

class ActivityHub {

  on(event, handler) {
    return addEventHandler(event, handler);
  }

  off(event, handle) {
    return removeEventHandler(event, handle);
  }

  start() {
    let attemptCount = 0;
    const maxAttempts = 12; // Try for up to 2 minutes

    const setup = setInterval(() => {
      attemptCount++;

      const commandChangeReportingService = ReactHandler.getCommandChangeReportingService();
      if (commandChangeReportingService) {
        assignEventHandlers(commandChangeReportingService);
        console.debug("ActivityHub: Events connected successfully");
        clearInterval(setup);

        // Start periodic authentication state logging for #1357
        this._startAuthenticationMonitoring();
      } else if (attemptCount >= maxAttempts) {
        console.warn('ActivityHub: Maximum connection attempts reached. Teams internal events may not be available.');
        clearInterval(setup);

        // Still start authentication monitoring even if React connection failed
        this._startAuthenticationMonitoring();
      }
    }, 10000);
  }

  // Monitor authentication state and initialize token cache for #1357
  _startAuthenticationMonitoring() {
    // Log authentication state immediately (this will trigger token cache injection if needed)
    ReactHandler.logAndAttemptTokenInjection();

    // Give Teams a moment to fully initialize, then try manual injection if auto-injection failed
    setTimeout(() => {
      const status = ReactHandler.getTokenCacheStatus();
      if (!status.injected && status.canRetry) {
        ReactHandler.injectTokenCache();
      }
    }, 15000); // 15 seconds after initial monitoring starts

    // Periodically check token cache status every 5 minutes
    this._authMonitorInterval = setInterval(() => {
      ReactHandler.logAndAttemptTokenInjection();

      const status = ReactHandler.getTokenCacheStatus();
      if (!status.injected && status.canRetry) {
        ReactHandler.injectTokenCache();
      }
    }, 5 * 60 * 1000);
  }

  stop() {
    if (this._authMonitorInterval) {
      clearInterval(this._authMonitorInterval);
      this._authMonitorInterval = null;
    }
  }

  setMachineState(state) {
    const teams2IdleTracker = ReactHandler.getTeams2IdleTracker();
    if (teams2IdleTracker) {
      try {
        if (state === 1) {
          teams2IdleTracker.handleMonitoredWindowEvent();
        } else {
          teams2IdleTracker.transitionToIdle();
        }
      } catch (e) {
        console.error("Failed to set teams2 Machine State", e);
      }
    }
  }

  setUserStatus(status) {
    const teams2IdleTracker = ReactHandler.getTeams2IdleTracker();
    if (teams2IdleTracker) {
      try {
        if (status === 1) {
          teams2IdleTracker.handleMonitoredWindowEvent();
        } else {
          teams2IdleTracker.transitionToIdle();
        }
      } catch (e) {
        console.error("Failed to set teams2 User Status", e);
      }
    }
  }

  refreshAppState(controller, state) {
    const self = controller.appStateService;
    controller.appStateService.refreshAppState.apply(self, [
      () => {
        self.inactiveStartTime = null;
        self.setMachineState(state);
        self.setActive(
          state == 1 && (self.current == 4 || self.current == 5)
            ? 3
            : self.current,
        );
      },
      "",
      null,
      null,
    ]);
  }
}

function isSupportedEvent(event) {
  return supportedEvents.has(event);
}

function isFunction(func) {
  return typeof (func) === 'function';
}

function getHandleIndex(event, handle) {
  return eventHandlers.findIndex(h => {
    return h.event === event && h.handle === handle;
  });
}

function addEventHandler(event, handler) {
  let handle;
  if (isSupportedEvent(event) && isFunction(handler)) {
    handle = crypto.randomUUID();
    eventHandlers.push({
      event: event,
      handle: handle,
      handler: handler
    });
  }
  return handle;
}

function removeEventHandler(event, handle) {
  const handlerIndex = getHandleIndex(event, handle);
  if (handlerIndex > -1) {
    eventHandlers[handlerIndex].handler = null;
    eventHandlers.splice(handlerIndex, 1);
    return handle;
  }

  return null;
}

function getEventHandlers(event) {
  return eventHandlers.filter(e => {
    return e.event === event;
  });
}

function assignEventHandlers(commandChangeReportingService) {
  commandChangeReportingService.observeChanges().subscribe((e) => {
    // Only handle events from type ["CommandStart", "ScenarioMarked"]
    // and context target ["internal-command-handler", "use-command-reporting-callbacks"]
    // Other events are navigation/UI events that should not trigger notifications
    if (!["CommandStart", "ScenarioMarked"].includes(e.type) ||
      !["internal-command-handler", "use-command-reporting-callbacks"].includes(e.context.target)) {
      return;
    }

    if (e.context.entityCommand) {
      handleNotificationEntityCommand(e.context.entityCommand);
      handleCallEventEntityCommand(e.context.entityCommand);
    } else {
      handleCallEventStep(e.context.step);
    }
  });
}

/**
 * Handle notification events from Teams entity commands
 * Detects chat messages, calendar invites, and other notification types
 */
function handleNotificationEntityCommand(entityCommand) {
  const options = entityCommand.entityOptions || {};

  // Skip call notifications (handled separately)
  if (options.isIncomingCall) {
    return;
  }

  // DEBUG: Log all entity commands to identify spurious notification triggers
  console.debug("[ActivityHub] Entity command received:", JSON.stringify({
    type: entityCommand.type,
    entityOptionsKeys: Object.keys(options),
    title: options.title,
    text: options.text,
    crossClientScenarioName: options.crossClientScenarioName,
    isChat: options.isChat,
    isMessage: options.isMessage,
    isCalendar: options.isCalendar,
    isMeetingInvite: options.isMeetingInvite,
    isMention: options.isMention,
    isReaction: options.isReaction,
    optionsType: options.type
  }));

  // Detect chat/message notifications
  if (isChatNotification(entityCommand)) {
    console.debug("[ActivityHub] Chat notification MATCHED");
    onChatNotification({
      title: options.title || options.senderName || 'New Message',
      body: options.text || options.preview || options.message || '',
      icon: options.mainImage?.src || options.senderImage,
      chatId: options.chatId,
      messageId: options.messageId,
      senderId: options.senderId
    });
  }

  // Detect calendar/meeting invite notifications
  if (isCalendarNotification(entityCommand)) {
    console.debug("[ActivityHub] Calendar notification MATCHED");
    onCalendarNotification({
      title: options.title || options.subject || 'Meeting Invitation',
      body: options.text || options.organizer || '',
      icon: options.mainImage?.src,
      meetingId: options.meetingId,
      eventId: options.eventId,
      startTime: options.startTime,
      endTime: options.endTime
    });
  }

  // Detect activity notifications (mentions, reactions)
  if (isActivityNotification(entityCommand)) {
    console.debug("[ActivityHub] Activity notification MATCHED");
    onActivityNotification({
      title: options.title || 'Teams Activity',
      body: options.text || options.preview || '',
      icon: options.mainImage?.src,
      activityType: options.activityType || options.type
    });
  }
}

/**
 * Check if entity command represents a chat notification
 */
function isChatNotification(entityCommand) {
  const options = entityCommand.entityOptions || {};
  const commandType = (entityCommand.type || '').toLowerCase();
  const scenarioName = (options.crossClientScenarioName || '').toLowerCase();

  return (
    commandType.includes('message') ||
    commandType.includes('chat') ||
    scenarioName.includes('message') ||
    scenarioName.includes('chat') ||
    options.isChat === true ||
    options.isMessage === true ||
    options.type === 'message' ||
    options.type === 'chat'
  );
}

/**
 * Check if entity command represents a calendar notification
 */
function isCalendarNotification(entityCommand) {
  const options = entityCommand.entityOptions || {};
  const commandType = (entityCommand.type || '').toLowerCase();
  const scenarioName = (options.crossClientScenarioName || '').toLowerCase();

  return (
    commandType.includes('calendar') ||
    commandType.includes('meeting') ||
    commandType.includes('invite') ||
    scenarioName.includes('calendar') ||
    scenarioName.includes('meeting_invite') ||
    scenarioName.includes('event') ||
    options.isCalendar === true ||
    options.isMeetingInvite === true ||
    options.type === 'calendar' ||
    options.type === 'meeting' ||
    options.type === 'event'
  );
}

/**
 * Check if entity command represents an activity notification
 */
function isActivityNotification(entityCommand) {
  const options = entityCommand.entityOptions || {};
  const commandType = (entityCommand.type || '').toLowerCase();

  return (
    commandType.includes('mention') ||
    commandType.includes('reaction') ||
    commandType.includes('reply') ||
    options.isMention === true ||
    options.isReaction === true ||
    options.type === 'mention' ||
    options.type === 'reaction'
  );
}

function handleCallEventEntityCommand(entityCommand) {
  if (entityCommand.entityOptions?.isIncomingCall) {
    if ("incoming_call" === entityCommand.entityOptions?.crossClientScenarioName) {
      // Gets triggered by incoming call.
      onIncomingCallCreated({
        caller: entityCommand.entityOptions.title,
        image: entityCommand.entityOptions.mainImage?.src,
        text: entityCommand.entityOptions.text
      });
    } else {
      // Gets triggered when incoming call toast gets dismissed regardless of accepting or declining the call
      onIncomingCallEnded();
    }
  }
}

function handleCallEventStep(step) {
  switch (step) {
    case "calling-screen-rendered":
      // Gets triggered when call is connected.
      onCallConnected();
      break;
    case "render_disconected":
      // Gets triggered when call is disconnected.
      onCallDisconnected();
      break;
    default:
      break;
  }
}

async function onIncomingCallCreated(data) {
  const handlers = getEventHandlers('incoming-call-created');
  for (const handler of handlers) {
    handler.handler(data);
  }
}

async function onIncomingCallEnded() {
  const handlers = getEventHandlers('incoming-call-ended');
  for (const handler of handlers) {
    handler.handler({});
  }
}

async function onCallConnected() {
  const handlers = getEventHandlers('call-connected');
  for (const handler of handlers) {
    handler.handler({});
  }
}

async function onCallDisconnected() {
  const handlers = getEventHandlers('call-disconnected');
  for (const handler of handlers) {
    handler.handler({});
  }
}

/**
 * Trigger chat notification event handlers
 * @param {object} data - Notification data (title, body, icon, chatId, etc.)
 */
async function onChatNotification(data) {
  const handlers = getEventHandlers('chat-notification');
  for (const handler of handlers) {
    handler.handler(data);
  }
}

/**
 * Trigger calendar notification event handlers
 * @param {object} data - Notification data (title, body, icon, meetingId, etc.)
 */
async function onCalendarNotification(data) {
  const handlers = getEventHandlers('calendar-notification');
  for (const handler of handlers) {
    handler.handler(data);
  }
}

/**
 * Trigger activity notification event handlers (mentions, reactions)
 * @param {object} data - Notification data (title, body, icon, activityType)
 */
async function onActivityNotification(data) {
  const handlers = getEventHandlers('activity-notification');
  for (const handler of handlers) {
    handler.handler(data);
  }
}

const activityHub = new ActivityHub();
module.exports = activityHub;
