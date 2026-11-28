#!/usr/bin/env node

/**
 * Automation Contract Documentation Generator
 *
 * Reads the single declaration of what the MQTT and D-Bus interfaces expose
 * (app/control/contract.js) and emits:
 *   - docs-site/docs/automation-contract-generated.md (human-readable reference)
 *   - docs-site/static/mqtt-asyncapi.json             (AsyncAPI 3.0 document for MQTT)
 *
 * Defaults for the MQTT subtopics are resolved from app/config/options.js and
 * app/mqtt/mediaTopics.js rather than repeated in the contract, and the Home
 * Assistant entities come from the pure function in
 * app/mqtt/homeAssistantDiscovery.js.
 *
 * Before writing anything the script lints the contract for completeness and
 * exits non-zero with "control contract lint:" messages on any violation. A
 * unit test regenerates both outputs and compares them with the committed
 * files, so stale output fails `npm run test:unit`.
 *
 * Usage: node scripts/generateControlDocs.js
 */

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const contract = require(path.join(ROOT, "app", "control", "contract.js"));
const options = require(path.join(ROOT, "app", "config", "options.js"));
const { getMediaTopics } = require(path.join(ROOT, "app", "mqtt", "mediaTopics.js"));
const { buildDiscoveryEntities } = require(path.join(ROOT, "app", "mqtt", "homeAssistantDiscovery.js"));

const DOCS_OUTPUT = path.join(ROOT, "docs-site", "docs", "automation-contract-generated.md");
const ASYNCAPI_OUTPUT = path.join(ROOT, "docs-site", "static", "mqtt-asyncapi.json");
const ASYNCAPI_URL = "https://ismaelmartinez.github.io/teams-for-linux/mqtt-asyncapi.json";
const ASYNCAPI_BINDING_VERSION = "0.2.0";
const ASYNCAPI_DOCUMENT_VERSION = "1.0.0";

const { shared, mqtt, dbus } = contract;

// ---------------------------------------------------------------------------
// Config option lookup
// ---------------------------------------------------------------------------

// Resolves a dotted config path ("mqtt.mediaTopics.inCall") against the
// option's default object. `exists` is false for a path the schema does not
// declare, such as a subtopic whose default is derived.
function resolveOption(dotPath) {
  const [name, ...rest] = dotPath.split(".");
  const option = options[name];
  if (!option) return { exists: false, default: undefined };
  let current = option.default;
  for (const segment of rest) {
    if (current === null || typeof current !== "object") return { exists: false, default: undefined };
    current = current[segment];
  }
  return { exists: current !== undefined, default: current };
}

// ---------------------------------------------------------------------------
// Lint
// ---------------------------------------------------------------------------

function isBlank(text) {
  return !text || !String(text).trim();
}

function lintState(violations) {
  const fields = new Set();
  for (const entry of shared.state) {
    const where = `state "${entry.field}"`;
    if (isBlank(entry.field)) violations.push("a state entry is missing its field");
    if (fields.has(entry.field)) violations.push(`${where} is declared twice`);
    fields.add(entry.field);
    if (isBlank(entry.type)) violations.push(`${where} is missing a type`);
    if (isBlank(entry.description)) violations.push(`${where} is missing a description`);
    if (entry.gate === undefined) violations.push(`${where} is missing gate (use null for none)`);
    if (typeof entry.personalData !== "boolean") violations.push(`${where} is missing personalData (true or false)`);
    if (entry.gate && !resolveOption(entry.gate).exists) violations.push(`${where} is gated by "${entry.gate}", which is not in app/config/options.js`);
  }
  return fields;
}

function lintCommands(violations) {
  for (const [id, command] of Object.entries(shared.commands)) {
    const where = `command "${id}"`;
    if (isBlank(command.description)) violations.push(`${where} is missing a description`);
    if (!Array.isArray(command.args)) violations.push(`${where} is missing args (use [] for none)`);
    if (!shared.effects[command.effect]) violations.push(`${where} has unknown effect "${command.effect}"`);
    if (command.effect === "shortcut" && !shared.shortcuts[command.shortcut]) violations.push(`${where} names unknown shortcut "${command.shortcut}"`);
    for (const arg of command.args ?? []) {
      if (isBlank(arg.name) || isBlank(arg.type) || isBlank(arg.description) || typeof arg.required !== "boolean") {
        violations.push(`${where} argument "${arg.name}" needs a name, type, description and required flag`);
      }
    }
  }
}

function lintMqtt(violations, fields) {
  const ids = new Set();
  for (const topic of mqtt.topics) {
    const where = `MQTT topic "${topic.id}"`;
    if (ids.has(topic.id)) violations.push(`${where} is declared twice`);
    ids.add(topic.id);
    if (isBlank(topic.description)) violations.push(`${where} is missing a description`);
    if (typeof topic.retained !== "boolean") violations.push(`${where} is missing retained (true or false)`);
    if (topic.gate === undefined) violations.push(`${where} is missing gate (use null for none)`);
    if (!topic.payload || !["text", "json"].includes(topic.payload.format)) violations.push(`${where} needs a payload with format "text" or "json"`);
    if (topic.payload?.format === "text" && !topic.payload.values?.length) violations.push(`${where} needs the payload values`);
    if (topic.payload?.format === "json" && !topic.payload.properties) violations.push(`${where} needs the payload properties`);
    if (topic.gate && !resolveOption(topic.gate).exists) violations.push(`${where} is gated by "${topic.gate}", which is not in app/config/options.js`);
    if (Boolean(topic.option) === Boolean(topic.fixedSubtopic)) violations.push(`${where} needs exactly one of option and fixedSubtopic`);
    if (!topic.state?.length && !topic.command) violations.push(`${where} carries neither state nor a command`);
    for (const field of topic.state ?? []) {
      if (!fields.has(field)) violations.push(`${where} carries unknown state field "${field}"`);
    }
    if (topic.command && !shared.commands[topic.command]) violations.push(`${where} names unknown command "${topic.command}"`);
    if (topic.option && !resolveOption(topic.option).exists && isBlank(topic.derivedDefault)) {
      violations.push(`${where} names option "${topic.option}", which is not in app/config/options.js and has no derivedDefault`);
    }
  }
  const actions = new Set();
  for (const { action, command } of mqtt.actions) {
    if (actions.has(action)) violations.push(`MQTT action "${action}" is declared twice`);
    actions.add(action);
    if (!shared.commands[command]) violations.push(`MQTT action "${action}" names unknown command "${command}"`);
  }
}

function lintDbus(violations, fields) {
  for (const [name, method] of Object.entries(dbus.methods)) {
    if (!shared.commands[method.command]) violations.push(`D-Bus method "${name}" names unknown command "${method.command}"`);
    if (typeof method.in !== "string" || typeof method.out !== "string") violations.push(`D-Bus method "${name}" needs in and out signatures`);
  }
  for (const [name, signal] of Object.entries(dbus.signals)) {
    if (isBlank(signal.signature)) violations.push(`D-Bus signal "${name}" is missing its signature`);
    if (signal.args?.length !== signal.signature?.length) violations.push(`D-Bus signal "${name}" needs one argument name per signature character`);
    if (!signal.state?.length) violations.push(`D-Bus signal "${name}" carries no state field`);
    for (const field of signal.state ?? []) {
      if (!fields.has(field)) violations.push(`D-Bus signal "${name}" carries unknown state field "${field}"`);
    }
  }
}

// Returns a list of completeness violations (empty when the contract is complete).
function lintContract() {
  const violations = [];
  const fields = lintState(violations);
  lintCommands(violations);
  lintMqtt(violations, fields);
  lintDbus(violations, fields);
  return violations;
}

// ---------------------------------------------------------------------------
// Resolved values
// ---------------------------------------------------------------------------

// The default subtopic a topic is published to, resolved from the option
// defaults and, for the two derived ones, from getMediaTopics.
function defaultSubtopic(topic) {
  if (topic.fixedSubtopic) return topic.fixedSubtopic;
  if (topic.option === "mqtt.statusTopic") return options.mqtt.default.statusTopic;
  const key = topic.option.split(".").pop();
  return getMediaTopics(options.mqtt.default)[key];
}

const topicsCarrying = (field) => mqtt.topics.filter((topic) => topic.state?.includes(field));
const signalsCarrying = (field) => Object.entries(dbus.signals)
  .filter(([name, signal]) => name !== "StateChanged" && signal.state.includes(field))
  .map(([name]) => name);
const actionFor = (commandId) => mqtt.actions.find(({ command }) => command === commandId);
const methodFor = (commandId) => Object.entries(dbus.methods).find(([, method]) => method.command === commandId);
const interfaceName = `${dbus.defaultBusName}.${dbus.interfaceSuffix}`;

// ---------------------------------------------------------------------------
// Markdown rendering
// ---------------------------------------------------------------------------

// A code span, with pipes escaped so the value stays inside one table cell.
function code(value) {
  return "`" + String(value).replaceAll("|", String.raw`\|`) + "`";
}

// Prose outside code spans. MDX reads <, > { and } as JSX and expressions, and
// a raw pipe ends a table cell, so those are HTML-encoded (ampersand first so
// the entities are not double-encoded). Existing backtick spans pass through.
function prose(text) {
  return String(text)
    .split(/(`[^`]*`)/)
    .map((part, index) => (index % 2 === 1
      ? part.replaceAll("|", String.raw`\|`)
      : part
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll("{", "&#123;")
        .replaceAll("}", "&#125;")
        .replaceAll("|", "&#124;")))
    .join("");
}

const orNone = (items) => (items.length ? items.join(", ") : "none");
const codeList = (items) => items.map(code).join(", ");
const codeOr = (items) => items.map(code).join(" or ");

function typeCell(entry) {
  const base = entry.nullable ? `${entry.type} or null` : entry.type;
  return entry.values ? `${code(base)}: ${codeOr(entry.values)}` : code(base);
}

function payloadKind(topic) {
  return topic.payload.format === "json" ? "JSON" : "text";
}

function mqttStateCell(field) {
  const cells = topicsCarrying(field).map((topic) => (
    `${code(defaultSubtopic(topic))} (${payloadKind(topic)}, ${topic.retained ? "retained" : "not retained"})`));
  return orNone(cells);
}

function renderStateTable() {
  let md = `| Field | Meaning | Type and values | Gate | Personal data | MQTT topic | D-Bus signal |
|-------|---------|-----------------|------|---------------|------------|--------------|
`;
  for (const entry of shared.state) {
    const signals = signalsCarrying(entry.field).map(code);
    md += `| ${code(entry.field)} | ${prose(entry.description)} | ${typeCell(entry)} | ${entry.gate ? code(entry.gate) : "none"} | ${entry.personalData ? "yes" : "no"} | ${mqttStateCell(entry.field)} | ${orNone(signals)} |\n`;
  }
  return md;
}

function argCell(args) {
  if (args.length === 0) return "none";
  return args.map((arg) => `${code(arg.name)} (${arg.type}, ${arg.required ? "required" : "optional"})`).join(", ");
}

function dbusSignatureCell(name, method) {
  const command = shared.commands[method.command];
  const params = [...method.in].map((type, index) => `${type} ${command.args[index]?.name ?? "arg"}`).join(", ");
  return `${code(`${name}(${params}) -> ${method.out}`)}`;
}

function renderCommandTable() {
  let md = `| Command | Arguments | Effect | MQTT action | D-Bus method |
|---------|-----------|--------|-------------|--------------|
`;
  for (const [id, command] of Object.entries(shared.commands)) {
    const action = actionFor(id);
    const method = methodFor(id);
    md += `| ${code(id)}: ${prose(command.description)} | ${argCell(command.args)} | ${prose(shared.effects[command.effect])} | ${action ? code(action.action) : "not available"} | ${method ? dbusSignatureCell(...method) : "not available"} |\n`;
  }
  return md;
}

function exampleValue(arg) {
  if (arg.name === "startDate") return "2026-01-05T00:00:00Z";
  if (arg.name === "endDate") return "2026-01-09T23:59:59Z";
  if (arg.type === "boolean") return true;
  return arg.values?.[0] ?? "value";
}

function exampleMessage(action, command) {
  const message = { action };
  for (const arg of command.args) message[arg.name] = exampleValue(arg);
  return JSON.stringify(message);
}

function payloadCell(topic) {
  const { payload } = topic;
  if (payload.format === "text") return `text: ${codeOr(payload.values)}`;
  return `JSON object with ${codeList(Object.keys(payload.properties))}`;
}

function subtopicCell(topic) {
  if (topic.fixedSubtopic) return `fixed ${code(topic.fixedSubtopic)}`;
  const resolved = defaultSubtopic(topic);
  const derived = topic.derivedDefault ? `; ${code(topic.derivedDefault)} when the option is unset` : "";
  return `${code(topic.option)} (default ${code(resolved)}${derived})`;
}

function gateCell(topic) {
  const gates = [topic.gate, ...(topic.requires ?? [])].filter(Boolean);
  return gates.length ? codeList(gates) : "none";
}

function renderTopicTable() {
  let md = `| Topic | Subtopic option | Payload | Retained | Gate | Carries |
|-------|-----------------|---------|----------|------|---------|
`;
  for (const topic of mqtt.topics) {
    const carries = [...(topic.state ?? []).map(code), ...(topic.command ? [`command ${code(topic.command)}`] : [])];
    md += `| ${code(`<topicPrefix>/${defaultSubtopic(topic)}`)} | ${subtopicCell(topic)} | ${payloadCell(topic)} | ${topic.retained ? "yes" : "no"} | ${gateCell(topic)} | ${carries.join(", ")} |\n`;
  }
  return md;
}

function renderActionTable() {
  let md = `| Action | Command | Arguments | Example message |
|--------|---------|-----------|-----------------|
`;
  for (const { action, command } of mqtt.actions) {
    md += `| ${code(action)} | ${code(command)} | ${argCell(shared.commands[command].args)} | ${code(exampleMessage(action, shared.commands[command]))} |\n`;
  }
  return md;
}

// The entities Home Assistant discovery creates for the default config plus a
// command topic, which is what makes the buttons appear.
function discoveryEntities() {
  return buildDiscoveryEntities({ ...options.mqtt.default, commandTopic: "command" });
}

function renderEntityTable() {
  let md = `| Component | Object id | Name | Reads or writes |
|-----------|-----------|------|-----------------|
`;
  for (const { component, objectId, config } of discoveryEntities()) {
    md += `| ${code(component)} | ${code(objectId)} | ${prose(config.name)} | ${code(config.state_topic ?? config.command_topic)} |\n`;
  }
  return md;
}

function renderMethodTable() {
  let md = `| Method | Signature | Command |
|--------|-----------|---------|
`;
  for (const [name, method] of Object.entries(dbus.methods)) {
    md += `| ${code(name)} | ${dbusSignatureCell(name, method)} | ${code(method.command)} |\n`;
  }
  return md;
}

function renderSignalTable() {
  let md = `| Signal | Signature | Arguments | State carried |
|--------|-----------|-----------|---------------|
`;
  for (const [name, signal] of Object.entries(dbus.signals)) {
    md += `| ${code(name)} | ${code(signal.signature)} | ${codeList(signal.args)} | ${codeList(signal.state)} |\n`;
  }
  return md;
}

function generateMarkdown() {
  const availability = mqtt.availability;
  const defaults = options.mqtt.default;
  const availabilityTopic = `<topicPrefix>/${availability.subtopic}`;
  return `# Automation Contract Reference (Auto-Generated)

:::note
This page is auto-generated by \`scripts/generateControlDocs.js\` from \`app/control/contract.js\`, the single declaration of what the automation interfaces expose. Do not edit it by hand. After changing the contract, run \`npm run generate-control-docs\` and commit the result.
:::

Teams for Linux offers two interfaces to other programs: [MQTT](mqtt-integration.md) on any platform, and a [D-Bus service](development/dbus-control.md) on the Linux session bus. Both describe the same things, the Teams state the app observes and the actions it can perform. This page lists them in one place, so you can see what you expose when you enable either interface and what each transport can and cannot do. Each interface is opt-in: \`mqtt.enabled\` for MQTT and \`dbusControl.enabled\` for D-Bus.

The MQTT side is also available as an AsyncAPI 3.0 document, [mqtt-asyncapi.json](${ASYNCAPI_URL}), for tools that read AsyncAPI.

## Observed state

Values are what the app observed, not state confirmed by Teams. D-Bus reports the selected profile, while MQTT publishes what any profile reports. The gate column names the option that must be on for the field to carry anything, and the personal data column marks fields that describe other people. The MQTT microphone topics never carry \`unknown\`: that value only appears in the D-Bus snapshot, before a microphone state has been observed.

${renderStateTable()}
## Commands

A command is an action another program can ask for. The MQTT action and D-Bus method columns show how each transport reaches it; "not available" means that transport has no way to ask for it.

${renderCommandTable()}
Neither transport reports whether Teams carried an action out: D-Bus methods return whether it was dispatched, and MQTT sends no reply.

## MQTT

### Connection and delivery

Every message is published with QoS ${mqtt.qos}. The availability topic ${code(availabilityTopic)} carries ${code(availability.online)} while the app is connected and ${code(availability.offline)} otherwise, and is ${availability.retained ? "retained" : "not retained"}. ${prose(availability.description)}

The client id is set with ${code(mqtt.client.clientIdOption)} (default ${code(defaults.clientId)}). The app leaves the clean session flag (${code(mqtt.client.cleanSession)}) and the keep-alive interval (${mqtt.client.keepAliveSeconds} seconds) at the MQTT library's defaults.

### Topics

Every topic is published under ${code(mqtt.topicPrefixOption)} (default ${code(defaults.topicPrefix)}). The subtopic of each can be renamed with the option in the second column.

${renderTopicTable()}
### Commands

Commands are read from ${code(`<topicPrefix>/<${mqtt.commandTopicOption}>`)} as a JSON object with an ${code("action")}. The option is empty by default, which turns command reception off. Actions the table does not list are ignored.

${renderActionTable()}
### Home Assistant entities

With \`mqtt.homeAssistant.enabled\` the app publishes retained discovery messages under ${code(`${defaults.homeAssistant.discoveryPrefix}/<component>/<clientId>/<objectId>/config`)} on every connect. For the default topics and a command topic of ${code("command")} they create these entities; the buttons are left out when no command topic is set.

${renderEntityTable()}
## D-Bus

The service lives on the user session bus, on Linux only.

| Item | Value |
|------|-------|
| Bus name | ${code(dbus.busNameOption)} when set; otherwise ${code(`$${dbus.busNameEnv}`)} or ${code(dbus.defaultBusName)} |
| Object path | ${code(dbus.objectPath)} |
| Interface | ${code(interfaceName)} |

### Methods

Signatures are D-Bus type signatures (\`b\` boolean, \`s\` string, \`i\` int32). A method returns \`true\` when the action was dispatched. \`GetState\` returns the whole observed state as a JSON string.

${renderMethodTable()}
### Signals

\`StateChanged\` carries the whole state as JSON on every change. The others carry one field, or two for presence, and fire only when that field changes.

${renderSignalTable()}
---

*Generated by \`scripts/generateControlDocs.js\` from \`app/control/contract.js\`.*
`;
}

// ---------------------------------------------------------------------------
// AsyncAPI
// ---------------------------------------------------------------------------

const capitalise = (text) => text.charAt(0).toUpperCase() + text.slice(1);
const mqttBinding = (extra) => ({ mqtt: { ...extra, bindingVersion: ASYNCAPI_BINDING_VERSION } });

// JSON Schema for a topic payload or a command argument.
function payloadSchema(payload) {
  if (payload.format === "text") return { type: "string", enum: payload.values };
  return {
    type: "object",
    required: payload.required,
    properties: payload.properties,
  };
}

function argumentSchema(arg) {
  const schema = { type: arg.type, description: arg.description };
  if (arg.format) schema.format = arg.format;
  if (arg.values) schema.enum = arg.values;
  return schema;
}

function actionSchema({ action, command }) {
  const { args } = shared.commands[command];
  return {
    title: action,
    description: shared.commands[command].description,
    type: "object",
    required: ["action", ...args.filter((arg) => arg.required).map((arg) => arg.name)],
    properties: {
      action: { const: action },
      ...Object.fromEntries(args.map((arg) => [arg.name, argumentSchema(arg)])),
    },
  };
}

function topicDescription(topic) {
  const parts = [topic.description];
  if (topic.option) {
    const note = topic.derivedDefault ? `, or ${topic.derivedDefault} when unset` : "";
    parts.push(`The subtopic is configurable: ${topic.option} renames it (default ${defaultSubtopic(topic)}${note}).`);
  } else {
    parts.push("The subtopic is fixed.");
  }
  const gates = [topic.gate, ...(topic.requires ?? [])].filter(Boolean);
  if (gates.length) parts.push(`Needs ${gates.join(" and ")}.`);
  parts.push(topic.retained ? "Retained." : "Not retained.");
  return parts.join(" ");
}

function generateAsyncApi() {
  const defaults = options.mqtt.default;
  const availability = mqtt.availability;
  const availabilityAddress = `{topicPrefix}/${availability.subtopic}`;
  const topicPrefixParameter = { $ref: "#/components/parameters/topicPrefix" };

  const channels = {
    availability: {
      address: availabilityAddress,
      description: `The availability topic. The app publishes ${availability.online} on connect and ${availability.offline} on a clean disconnect; the broker publishes ${availability.offline} as the last will. The subtopic is fixed. Retained.`,
      parameters: { topicPrefix: topicPrefixParameter },
      messages: { availability: { $ref: "#/components/messages/availability" } },
    },
  };
  const operations = {
    publishAvailability: {
      action: "send",
      channel: { $ref: "#/channels/availability" },
      messages: [{ $ref: "#/channels/availability/messages/availability" }],
      bindings: mqttBinding({ qos: mqtt.qos, retain: availability.retained }),
    },
  };
  const messages = {
    availability: {
      name: "availability",
      contentType: "text/plain",
      payload: { type: "string", enum: [availability.online, availability.offline] },
    },
  };

  for (const topic of mqtt.topics) {
    channels[topic.id] = {
      address: `{topicPrefix}/${defaultSubtopic(topic)}`,
      description: topicDescription(topic),
      parameters: { topicPrefix: topicPrefixParameter },
      messages: { [topic.id]: { $ref: `#/components/messages/${topic.id}` } },
    };
    operations[`publish${capitalise(topic.id)}`] = {
      action: "send",
      channel: { $ref: `#/channels/${topic.id}` },
      messages: [{ $ref: `#/channels/${topic.id}/messages/${topic.id}` }],
      bindings: mqttBinding({ qos: mqtt.qos, retain: topic.retained }),
    };
    messages[topic.id] = {
      name: topic.id,
      contentType: topic.payload.format === "json" ? "application/json" : "text/plain",
      payload: payloadSchema(topic.payload),
    };
  }

  channels.command = {
    address: "{topicPrefix}/{commandTopic}",
    description: `Commands the app accepts, as a JSON object with an action. The subtopic is configurable: ${mqtt.commandTopicOption} names it, and it is empty by default, which turns command reception off.`,
    parameters: {
      topicPrefix: topicPrefixParameter,
      commandTopic: { $ref: "#/components/parameters/commandTopic" },
    },
    messages: { command: { $ref: "#/components/messages/command" } },
  };
  operations.receiveCommand = {
    action: "receive",
    channel: { $ref: "#/channels/command" },
    messages: [{ $ref: "#/channels/command/messages/command" }],
    bindings: mqttBinding({ qos: mqtt.qos }),
  };
  messages.command = {
    name: "command",
    contentType: "application/json",
    payload: { oneOf: mqtt.actions.map(actionSchema) },
  };

  return {
    asyncapi: "3.0.0",
    info: {
      title: "Teams for Linux MQTT interface",
      version: ASYNCAPI_DOCUMENT_VERSION,
      description: "The MQTT topics Teams for Linux publishes and the commands it accepts. Generated by scripts/generateControlDocs.js from app/control/contract.js; do not edit by hand. Every subtopic can be renamed in the configuration, and the defaults are shown.",
    },
    defaultContentType: "text/plain",
    servers: {
      broker: {
        host: "localhost:1883",
        protocol: "mqtt",
        description: "The broker set in mqtt.brokerUrl.",
        bindings: mqttBinding({
          clientId: defaults.clientId,
          cleanSession: mqtt.client.cleanSession,
          keepAlive: mqtt.client.keepAliveSeconds,
          lastWill: {
            topic: `${defaults.topicPrefix}/${availability.subtopic}`,
            qos: mqtt.qos,
            message: availability.offline,
            retain: availability.retained,
          },
        }),
      },
    },
    channels,
    operations,
    components: {
      parameters: {
        topicPrefix: { description: `The ${mqtt.topicPrefixOption} option.`, default: defaults.topicPrefix },
        commandTopic: { description: `The ${mqtt.commandTopicOption} option; reception is off while it is empty.`, examples: ["command"] },
      },
      messages,
    },
  };
}

function renderAsyncApi() {
  return JSON.stringify(generateAsyncApi(), null, 2) + "\n";
}

// ---------------------------------------------------------------------------

function main() {
  const violations = lintContract();
  if (violations.length > 0) {
    for (const violation of violations) {
      console.error(`control contract lint: ${violation}`);
    }
    console.error(
      `control contract lint: ${violations.length} violation(s) in app/control/contract.js; no output written.`,
    );
    process.exit(1);
  }

  fs.mkdirSync(path.dirname(ASYNCAPI_OUTPUT), { recursive: true });
  fs.writeFileSync(DOCS_OUTPUT, generateMarkdown(), "utf8");
  fs.writeFileSync(ASYNCAPI_OUTPUT, renderAsyncApi(), "utf8");

  console.log("Generated the automation contract reference:");
  console.log(`  ${path.relative(ROOT, DOCS_OUTPUT)}`);
  console.log(`  ${path.relative(ROOT, ASYNCAPI_OUTPUT)}`);
}

if (require.main === module) {
  main();
}

module.exports = {
  DOCS_OUTPUT,
  ASYNCAPI_OUTPUT,
  lintContract,
  generateMarkdown,
  generateAsyncApi,
  renderAsyncApi,
  resolveOption,
  defaultSubtopic,
};
