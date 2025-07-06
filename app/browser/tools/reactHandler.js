class ReactHandler {
  getCommandChangeReportingService() {
    const teams2CoreServices = this._getTeams2CoreServices();
    return teams2CoreServices?.commandChangeReportingService;
  }

  getTeams2IdleTracker() {
    const teams2CoreServices = this._getTeams2CoreServices();
    return teams2CoreServices?.clientState?._idleTracker;
  }

  getTeams2ClientPreferences() {
    const teams2CoreServices = this._getTeams2CoreServices();
    return teams2CoreServices?.clientPreferences?.clientPreferences;
  }

  _getTeams2ReactElement() {
    return document.getElementById("app");
  }

  _getTeams2CoreServices() {
    const reactElement = this._getTeams2ReactElement();
    const internalRoot =
      reactElement?._reactRootContainer?._internalRoot ||
      reactElement?._reactRootContainer;
    return internalRoot?.current?.updateQueue?.baseState?.element?.props
      ?.coreServices;
  } // Method to listen to all events and log them for debugging
  debugAllEvents() {
    const service = this.getCommandChangeReportingService();
    if (!service) {
      console.warn("commandChangeReportingService not available");
      return;
    }

    try {
      service.observeChanges().subscribe((event) => {
        const step = event.context?.step;
        const type = event.type;
        const target = event.context?.target;
        const crossClientScenario =
          event.context?.entityCommand?.entityOptions?.crossClientScenarioName;
        const isIncomingCall =
          event.context?.entityCommand?.entityOptions?.isIncomingCall;
        const entityType = event.context?.entityCommand?.entity?.type;
        const entityAction = event.context?.entityCommand?.entity?.action;
        const scenarioName = event.context?.scenarioName;
        const source = event.context?.source;
        const visibilityState =
          event.context?.entityCommand?.command?.visibilityState;
        const stateTransition =
          event.context?.entityCommand?.command?.stateTransition;

        // Identify call/meeting events based on patterns found in logs
        const isCallMeetingEvent = this._isCallMeetingEvent(event);

        if (isCallMeetingEvent) {
          console.log("🔥 CALL/MEETING EVENT DETECTED 🔥");
          console.log("Event Type:", type);
          console.log("Target:", target);
          console.log("Step:", step);
          console.log("CrossClientScenario:", crossClientScenario);
          console.log("IsIncomingCall:", isIncomingCall);
          console.log("EntityType:", entityType);
          console.log("EntityAction:", entityAction);
          console.log("ScenarioName:", scenarioName);
          console.log("Source:", source);
          console.log("Full event:", event);
          console.log("=====================================");
        } else {
          // Log all other events but less prominently
          console.log("--- Teams Event ---");
          console.log("Type:", type, "Target:", target, "Step:", step);
          console.log("------------------");
        }
      });
      console.log(
        "Teams event debugging enabled. Call/meeting events will be highlighted."
      );
    } catch (error) {
      console.error("Error setting up event debugging:", error);
    }
  }

  // Helper method to detect call/meeting events based on patterns
  _isCallMeetingEvent(event) {
    const step = event.context?.step;
    const type = event.type;
    const target = event.context?.target;
    const crossClientScenario =
      event.context?.entityCommand?.entityOptions?.crossClientScenarioName;
    const entityType = event.context?.entityCommand?.entity?.type;
    const entityAction = event.context?.entityCommand?.entity?.action;
    const scenarioName = event.context?.scenarioName;
    const visibilityState =
      event.context?.entityCommand?.command?.visibilityState;
    const stateTransition =
      event.context?.entityCommand?.command?.stateTransition;

    // Key patterns identified from the logs:
    const callMeetingSteps = [
      // Call creation flow patterns
      "call_creation",
      "call_creation_request",
      "calling_started",
      "calling_context",

      // Pre-join/cancel flow patterns
      "render_prejoin",
      "calling-screen-rendered",
      "pause_ongoing_calling_scenarios",
      "transport_companion_device_info_done",
      "call_data_done",
      "calling_intent_query_done",
      "is_anonymous_user_query_done",

      // Active call/join flow patterns
      "render_call",
      "render_calling_screen",
      "render_calling_views_renderer",

      // Call termination/end flow patterns
      "render_disconnecting",
      "render_disconected", // Note: Microsoft's typo
      "render_call_end_screen",

      // Legacy patterns
      "prejoin_mounted",
      "prejoin_unmounted",

      // Expected patterns (to be confirmed)
      "join_call",
      "call_start",
      "call_end",
      "incoming_call",
      "outgoing_call",
      "meeting_start",
      "meeting_join",
      "meeting_leave",
    ];

    const callMeetingScenarios = [
      // Confirmed scenarios
      "calling_entity_command_calls_create",
      "calling_entity_command_calls_view",

      // Expected scenarios
      "CallStart",
      "CallEnd",
      "MeetingJoin",
      "MeetingLeave",
      "IncomingCall",
    ];

    const callMeetingTargets = [
      "calling",
      "prejoin",
      "meeting",
      "call",
      "createAndRegisterHideExtensionCommand", // UI dialog/extension actions like invite screen close
      "internal-command-handler", // Command handling for call actions
      "internal-command-handler-execute-before-command-handled-hook", // Command pre-processing hooks
    ];

    // Check for step-based detection
    if (step && callMeetingSteps.some((pattern) => step.includes(pattern))) {
      return true;
    }

    // Check for scenario-based detection (both crossClientScenario and scenarioName)
    if (
      crossClientScenario &&
      callMeetingScenarios.some((pattern) =>
        crossClientScenario.includes(pattern)
      )
    ) {
      return true;
    }

    if (
      scenarioName &&
      callMeetingScenarios.some((pattern) => scenarioName.includes(pattern))
    ) {
      return true;
    }

    // Check for target-based detection
    if (
      target &&
      callMeetingTargets.some((pattern) => target.includes(pattern))
    ) {
      return true;
    }

    // Check for entity type/action patterns (updated paths based on actual event structure)
    if (
      entityType === "calls" ||
      entityType === "shareMeetingInfo" ||
      entityType === "toasts" ||
      entityType === "bannerNotification" ||
      entityAction === "create" ||
      entityAction === "view" ||
      entityAction === "join" ||
      entityAction === "start" ||
      entityAction === "delete"
    ) {
      return true;
    }

    // Check for notification/toast patterns
    if (
      (entityType === "toasts" &&
        entityAction === "view" &&
        visibilityState === "show") ||
      (entityType === "bannerNotification" &&
        (entityAction === "create" || entityAction === "delete"))
    ) {
      return true;
    }

    // Check for call-related visibility state changes
    if (
      visibilityState &&
      (visibilityState === "show" || visibilityState === "hide") &&
      (entityType === "shareMeetingInfo" ||
        entityType === "toasts" ||
        entityType === "bannerNotification")
    ) {
      return true;
    }

    // Check for specific event types with calling target
    if (
      (type === "ScenarioMarked" ||
        type === "Rendered" ||
        type === "ChunkLoadStarted" ||
        type === "ChunkLoadSucceeded") &&
      target === "use-command-reporting-callbacks"
    ) {
      return true;
    }

    // Check for ScenarioMarked events with call/meeting related data
    if (type === "ScenarioMarked" && step) {
      return callMeetingSteps.some((pattern) =>
        step.toLowerCase().includes(pattern.toLowerCase())
      );
    }

    return false;
  }
}

//document.getElementById('app')._reactRootContainer.current.updateQueue.baseState.element.props.coreServices

module.exports = new ReactHandler();

// await document.getElementById('app')._reactRootContainer.current.updateQueue.baseState.element.props.coreServices.authenticationService._coreAuthService._authProvider.acquireToken("https://graph.microsoft.com", { correlation: document.getElementById('app')._reactRootContainer.current.updateQueue.baseState.element.props.coreServices.correlation, forceRenew: true} )
