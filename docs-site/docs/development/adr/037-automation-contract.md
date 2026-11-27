---
id: 037-automation-contract
---

# ADR 037: One Declared Automation Contract for MQTT and D-Bus

## Status

✅ Accepted (2026-11-27)

## Context

The application offers two interfaces to other programs: MQTT on any platform ([ADR-006](006-cli-argument-parsing-library.md)) and the Linux session D-Bus service ([ADR-033](033-dbus-control-api.md)), built on the transport-neutral layer in `app/control/`. Both describe the same things, the Teams state the app observes and the actions it can perform, but nothing declared that shared interface. The presence names appeared in three files, the keyboard shortcut map twice, and the caller field list and participant limits in more than one file, so a change had to be remembered in each place.

The documentation drifted the same way. The MQTT and D-Bus guides are hand-written, disagree with the code in places, and a user could not see in one place what enabling either interface exposes, including the fields that carry other people's names or numbers.

[ADR-029](029-config-schema-single-source-of-truth.md) already solved this for configuration: `app/config/options.js` is the schema, the code reads it, and `scripts/generateConfigDocs.js` produces the reference.

## Decision

Declare the interface once in `app/control/contract.js`, a pure data module with three parts: the shared model (presence, microphone states, caller fields, shortcuts, one entry per observed state field, one per command), the MQTT binding (topics, payloads, retained flags, command actions) and the D-Bus binding (methods, signals and their signatures). It has no `require`, so the code and a generator script load it the same way.

The code reads it where it used to carry copies: the state and control services, the MQTT client and media status service, and the Home Assistant discovery entity list, which is now a pure function. The generator `scripts/generateControlDocs.js` writes `docs-site/docs/automation-contract-generated.md` and an AsyncAPI document for the MQTT side, `docs-site/static/mqtt-asyncapi.json`. A unit test regenerates both and fails when they are stale, and others pin the code to the contract.

The D-Bus interface descriptor in `app/dbus/controlService.js` stays hand-written and is pinned to the contract by a test instead of being derived from it. The descriptor is the wire format the bus clients depend on, and a derived one would let an edit to the contract change it without a reviewer reading the diff of the adapter.

## Consequences

### Positive

A new topic, command or state field is declared once, and the reference, the AsyncAPI file and the tests follow. A user can see what each interface exposes and which fields are personal data. Drift between the contract and the adapters fails the unit tests rather than surfacing as a bug report.

### Negative

The contract is one more file to edit when an interface changes, and the generated files must be committed with it. The MQTT adapter still owns its own publish logic, so the contract describes it rather than drives it: a test can catch a retain flag or action that disagrees, not a topic published without being declared.

### Neutral

The hand-written guides remain; a follow-up corrects them against the generated reference. Behaviour for valid input is unchanged.

## Alternatives Considered

### Documentation only, kept honest with tests

Describe the interface in prose and add tests that compare it with the code. Rejected: the tests would still need a machine-readable description to compare against, which is the contract without the benefit of the code reading it.

### Rebuild MQTT as an adapter on `app/control`

Give MQTT the same shape as D-Bus, so it publishes the state service's snapshot and dispatches commands through the control service. This is the natural next step and would remove the remaining duplicated logic, such as MQTT's own microphone guard. It is deliberately not part of this change, which keeps behaviour fixed and the diff reviewable.

## Related

- [ADR-029](029-config-schema-single-source-of-truth.md): the same pattern for configuration
- [ADR-033](033-dbus-control-api.md): the D-Bus service and the transport-neutral control layer
- Generated reference: [automation-contract-generated.md](../../automation-contract-generated.md); module notes in `app/control/README.md`
