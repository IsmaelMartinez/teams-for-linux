# Control service

`teamsControlService.js` provides transport-neutral, named Teams actions and the selected-profile state snapshot to optional adapters. It owns the fixed shortcut mappings, Teams' authenticated presence-service request, and incoming-call action dispatch boundary; arbitrary shortcut input and Graph/calendar access are not part of this service.

The service is created and started by the application only on Linux when D-Bus control is enabled. It observes state when supplied, and `dispose()` detaches that listener during shutdown. MQTT command handling remains independent and unchanged. Without an enabled adapter, this module is not started.

`contract.js` declares what the MQTT and D-Bus interfaces expose: the shared state and commands, the MQTT topics and actions, and the D-Bus methods and signals ([ADR-037](../../docs-site/docs/development/adr/037-automation-contract.md)). It is plain data that the control and state services and the MQTT client read, and `npm run generate-control-docs` turns it into the reference page and an AsyncAPI file. Edit it, then regenerate; a unit test fails when the generated files are stale.
