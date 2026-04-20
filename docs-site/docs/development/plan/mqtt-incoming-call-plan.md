# MQTT Incoming Call & Meeting-Starting Topics Implementation Plan

:::important For agentic workers
REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
:::

**Date:** 2026-04-20
**Issue:** [#2370 - Add incoming call(s) of any kind into MQTT](https://github.com/IsmaelMartinez/teams-for-linux/issues/2370)
**Goal:** Publish incoming-call and scheduled-meeting-starting events to MQTT so Home Assistant users can trigger smart-home automations the moment Teams rings or a scheduled meeting is about to start.

**Architecture:** Phase 1 reuses the existing IPC-to-MQTT bridge pattern. The renderer already fires `incoming-call-created` / `incoming-call-ended` via Teams React state. `BrowserWindowManager` catches those, and we add `app.emit('teams-incoming-call-started' | 'teams-incoming-call-ended')` alongside the existing `app.emit('teams-call-connected')`. `MQTTMediaStatusService` listens via `app.on(...)` and publishes to `{topicPrefix}/incoming-call`. No new IPC channels, no new config keys, payload is boolean-only. Phase 2 adds a new `CalendarPollingService` that uses the existing Graph API client to maintain a rolling 12-24h cache and publishes `{topicPrefix}/meeting-starting` when a calendar event enters a configurable lead-time window.

**Tech Stack:** Node.js, Electron main process, `mqtt` library, existing `app/graphApi/index.js` client, existing `app/mqtt/index.js` MQTTClient with `publish()` method and Last Will Testament (LWT) on `{topicPrefix}/connected`.

---

## Scope & Non-Goals

In scope for Phase 1: MQTT publish parity with `incomingCallCommand` — any event that fires `incoming-call-created` in the renderer fires `{topicPrefix}/incoming-call = "true"`, paired with `"false"` on `incoming-call-ended`. In scope for Phase 2: calendar-driven prediction of scheduled meetings starting.

Out of scope: detecting scheduled-meeting-started via Teams events (known not to fire `isIncomingCall`); distinguishing 1:1 vs group vs channel invite in the payload; caller name or meeting subject in payload (YAGNI, privacy). Retained until a second user requests them.

Crash recovery: relies on existing LWT (`{topicPrefix}/connected = "false"`). Home Assistant consumers must treat `connected=false` as an implicit reset for all stateful topics. This is already documented and consistent with other topics.

---

## File Structure

```text
app/
  mainAppWindow/
    browserWindowManager.js    # MODIFY: emit app-level events from incoming-call handlers
  mqtt/
    mediaStatusService.js      # MODIFY: listen for new app events, publish MQTT
    calendarPollingService.js  # CREATE (Phase 2): Graph API calendar polling + publish
  config/
    index.js                   # MODIFY (Phase 2): add mqtt.meetingStarting.* defaults
  index.js                     # MODIFY (Phase 2): initialize CalendarPollingService

tests/unit/
  mediaStatusService.test.js          # CREATE: cover new handlers (and existing ones opportunistically)
  calendarPollingService.test.js      # CREATE (Phase 2)

docs-site/docs/
  configuration.md                    # MODIFY: document new MQTT topics
  development/plan/roadmap.md         # MODIFY: mark #2370 Phase 1 done
  development/plan/mqtt-incoming-call-plan.md  # THIS FILE

app/mqtt/
  README.md                           # MODIFY: describe new topics
```

---

## Phase 1: Incoming-Call Topic (Parity)

### Task 1: App-event bridge for incoming-call lifecycle

**Files:**
- Modify: `app/mainAppWindow/browserWindowManager.js:196-225`

- [ ] **Step 1: Read current handlers** at `app/mainAppWindow/browserWindowManager.js:196-235` (`assignOnIncomingCallCreatedHandler`, `assignOnIncomingCallEndedHandler`, `handleOnIncomingCallEnded`) and the existing reference pattern at line 244 (`app.emit('teams-call-connected')`).

- [ ] **Step 2: Emit app event at end of created handler**

Add `app.emit('teams-incoming-call-started')` as the last statement of `assignOnIncomingCallCreatedHandler`'s returned async function, after the existing toast/command logic. Match the placement of line 244.

```javascript
assignOnIncomingCallCreatedHandler() {
  return async (e, data) => {
    if (this.config.incomingCallCommand) {
      this.handleOnIncomingCallEnded();
      const commandArgs = [
        ...this.config.incomingCallCommandArgs,
        this.sanitizeCommandArg(data.caller),
        this.sanitizeCommandArg(data.text),
        this.sanitizeCommandArg(data.image),
      ];
      this.incomingCallCommandProcess = spawn(
        this.config.incomingCallCommand,
        commandArgs
      );
      this.incomingCallCommandProcess.on('error', (err) => {
        console.error('[IncomingCall] Failed to execute incoming call command', { code: err.code });
        this.incomingCallCommandProcess = null;
      });
    }
    if (this.config.enableIncomingCallToast) {
      this.incomingCallToast.show(data);
    }
    app.emit('teams-incoming-call-started');
  };
}
```

- [ ] **Step 3: Emit app event in ended handler**

Add `app.emit('teams-incoming-call-ended')` after `this.handleOnIncomingCallEnded()` in `assignOnIncomingCallEndedHandler`.

```javascript
assignOnIncomingCallEndedHandler() {
  return async (e) => {
    this.handleOnIncomingCallEnded();
    app.emit('teams-incoming-call-ended');
  };
}
```

Do NOT emit from inside `handleOnIncomingCallEnded()` itself, because that method is also called defensively from the created handler when a prior call was not cleaned up; emitting there would publish a spurious false/true pair.

- [ ] **Step 4: Run lint**

```bash
npm run lint
```

Expected: no errors on `browserWindowManager.js`.

- [ ] **Step 5: Commit**

```bash
git add app/mainAppWindow/browserWindowManager.js
git commit -m "feat(mqtt): emit app-level events for incoming call lifecycle"
```

---

### Task 2: MediaStatusService handlers + MQTT publish

**Files:**
- Modify: `app/mqtt/mediaStatusService.js`
- Create: `tests/unit/mediaStatusService.test.js`

- [ ] **Step 1: Write failing test**

Create `tests/unit/mediaStatusService.test.js` following the pattern in `tests/unit/speakingIndicator.test.js` (Node's built-in test runner, minimal mocks). Test the two new handlers: when `app.emit('teams-incoming-call-started')` fires, the service publishes `"true"` to `{topicPrefix}/incoming-call` with `retain: true`; when `teams-incoming-call-ended` fires, it publishes `"false"`.

```javascript
const { test } = require('node:test');
const assert = require('node:assert');
const { EventEmitter } = require('node:events');

// Minimal mock: stub `electron` module BEFORE requiring the service
const mockApp = new EventEmitter();
const mockIpcMain = new EventEmitter();
require.cache[require.resolve('electron')] = {
  exports: { app: mockApp, ipcMain: mockIpcMain },
};

const MQTTMediaStatusService = require('../../app/mqtt/mediaStatusService');

test('publishes true to incoming-call topic on teams-incoming-call-started', async () => {
  const published = [];
  const mqttClient = { publish: async (topic, payload, opts) => { published.push({ topic, payload, opts }); } };
  const service = new MQTTMediaStatusService(mqttClient, { mqtt: { topicPrefix: 'teams' } });
  service.initialize();

  mockApp.emit('teams-incoming-call-started');
  await new Promise((r) => setImmediate(r));

  const hit = published.find((p) => p.topic === 'teams/incoming-call');
  assert.ok(hit, 'expected publish to teams/incoming-call');
  assert.strictEqual(hit.payload, 'true');
  assert.deepStrictEqual(hit.opts, { retain: true });
});

test('publishes false to incoming-call topic on teams-incoming-call-ended', async () => {
  const published = [];
  const mqttClient = { publish: async (topic, payload, opts) => { published.push({ topic, payload, opts }); } };
  const service = new MQTTMediaStatusService(mqttClient, { mqtt: { topicPrefix: 'teams' } });
  service.initialize();

  mockApp.emit('teams-incoming-call-ended');
  await new Promise((r) => setImmediate(r));

  const hit = published.find((p) => p.topic === 'teams/incoming-call');
  assert.ok(hit);
  assert.strictEqual(hit.payload, 'false');
});
```

Note: if `speakingIndicator.test.js` uses a different mocking style (e.g. `proxyquire`, `jest`), match that instead. The exact mocking shim is secondary to the assertion.

- [ ] **Step 2: Run test, confirm it fails**

```bash
node --test tests/unit/mediaStatusService.test.js
```

Expected: two failing assertions ("expected publish to teams/incoming-call"). Fails because the service does not yet listen for the new events.

- [ ] **Step 3: Add handlers in `mediaStatusService.js`**

In `initialize()`, add two `app.on(...)` lines after the existing `teams-call-disconnected` binding. Add the matching private methods.

```javascript
initialize() {
  ipcMain.on('camera-state-changed', this.#handleCameraChanged.bind(this));
  ipcMain.on('microphone-state-changed', this.#handleMicrophoneChanged.bind(this));
  ipcMain.on('screen-sharing-started', () => this.#handleScreenSharingChanged(true));
  ipcMain.on('screen-sharing-stopped', () => this.#handleScreenSharingChanged(false));

  app.on('teams-call-connected', this.#handleCallConnected.bind(this));
  app.on('teams-call-disconnected', this.#handleCallDisconnected.bind(this));
  app.on('teams-incoming-call-started', this.#handleIncomingCallStarted.bind(this));
  app.on('teams-incoming-call-ended', this.#handleIncomingCallEnded.bind(this));

  console.info('[MQTTMediaStatusService] Initialized');
}

async #handleIncomingCallStarted() {
  const topic = `${this.#topicPrefix}/incoming-call`;
  await this.#mqttClient.publish(topic, 'true', { retain: true });
  console.debug('[MQTTMediaStatusService] Incoming call started, published to', topic);
}

async #handleIncomingCallEnded() {
  const topic = `${this.#topicPrefix}/incoming-call`;
  await this.#mqttClient.publish(topic, 'false', { retain: true });
  console.debug('[MQTTMediaStatusService] Incoming call ended, published to', topic);
}
```

Also update the header JSDoc comment listing published topics:

```javascript
/**
 * MQTT Media Status Service
 *
 * Bridges IPC events from renderer process (WebRTC monitoring, call state)
 * to MQTT broker for home automation integration.
 *
 * Publishes to topics:
 * - {topicPrefix}/camera - Camera on/off state
 * - {topicPrefix}/microphone - Microphone on/off state
 * - {topicPrefix}/in-call - Active call state
 * - {topicPrefix}/incoming-call - Ringing/invite state (before accept)
 * - {topicPrefix}/screen-sharing - Screen sharing active state
 */
```

- [ ] **Step 4: Run tests, confirm pass**

```bash
node --test tests/unit/mediaStatusService.test.js
```

Expected: both tests PASS.

- [ ] **Step 5: Run lint**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add app/mqtt/mediaStatusService.js tests/unit/mediaStatusService.test.js
git commit -m "feat(mqtt): publish incoming-call topic for ring/invite events"
```

---

### Task 3: End-to-end smoke test of the event chain

**Files:**
- (no new files; manual verification)

- [ ] **Step 1: Run the app with debug logging**

```bash
ELECTRON_ENABLE_LOGGING=true npm start -- --logConfig='{"transports":{"console":{"level":"debug"}}}'
```

- [ ] **Step 2: Trigger an incoming 1:1 call from another Teams account and confirm debug logs show**

- `[IncomingCall] Received notification ...` (from activityManager / activityHub)
- `[MQTTMediaStatusService] Incoming call started, published to teams/incoming-call`

- [ ] **Step 3: Let the call end (decline, let it ring out, or accept then hang up) and confirm**

- `[MQTTMediaStatusService] Incoming call ended, published to teams/incoming-call`

- [ ] **Step 4: Subscribe to the broker from a second terminal and confirm payloads**

```bash
mosquitto_sub -h <broker> -t 'teams/incoming-call' -v
```

Expected: `teams/incoming-call true` on ring, `teams/incoming-call false` on end, with retained flag visible on reconnect.

- [ ] **Step 5: No commit — this is manual verification only.**

---

### Task 4: Documentation updates

**Files:**
- Modify: `docs-site/docs/configuration.md` around line 385 (Published Topics table)
- Modify: `app/mqtt/README.md` (published topics list)
- Modify: `docs-site/docs/development/plan/roadmap.md` (MQTT Integration section near the #2370 reference, currently around line 51)

- [ ] **Step 1: Add row to the Published Topics table in `docs-site/docs/configuration.md`**

Insert after the `in-call` row (line 385):

```markdown
| `\{topicPrefix\}/incoming-call` | `"true"` or `"false"` | Incoming call ringing / invite toast state (fires before user accepts). Parity with `incomingCallCommand`. Covers 1:1 ring-type calls that Teams signals via `isIncomingCall`. Scheduled meeting starts use the `meeting-starting` topic instead. |
```

- [ ] **Step 2: Add the same topic in the `app/mqtt/README.md` published-topics list**

Follow the format already used for other topics there.

- [ ] **Step 3: Update roadmap**

In `docs-site/docs/development/plan/roadmap.md` find the sentence that currently reads "A feature request for incoming call MQTT topics ([#2370](...)) has been filed." Replace with a phrased note that Phase 1 (boolean topic, parity with `incomingCallCommand`) has shipped and Phase 2 (calendar-driven meeting-starting) is awaiting user confirmation.

Also bump the `Last Updated` date at the top.

- [ ] **Step 4: Commit**

```bash
git add docs-site/docs/configuration.md app/mqtt/README.md docs-site/docs/development/plan/roadmap.md
git commit -m "docs(mqtt): document incoming-call topic"
```

---

### Task 5: Example Home Assistant automation in the MQTT integration guide

**Files:**
- Modify: `docs-site/docs/mqtt-integration.md` (add a new subsection under existing HA examples)

- [ ] **Step 1: Read current HA examples in `docs-site/docs/mqtt-integration.md`** to match style.

- [ ] **Step 2: Add an example automation**

```yaml
# Flash office LED orange when Teams is ringing
automation:
  - alias: "Teams incoming call — orange LED"
    trigger:
      - platform: mqtt
        topic: "teams/incoming-call"
        payload: "true"
    action:
      service: light.turn_on
      target:
        entity_id: light.office
      data:
        rgb_color: [255, 140, 0]
        flash: short

  - alias: "Teams incoming call cleared — restore LED"
    trigger:
      - platform: mqtt
        topic: "teams/incoming-call"
        payload: "false"
      - platform: mqtt
        topic: "teams/connected"
        payload: "false"
    action:
      service: light.turn_off
      target:
        entity_id: light.office
```

The second trigger on `teams/connected=false` is important: it treats app disconnection as an implicit reset, which covers the crash case via LWT.

- [ ] **Step 3: Commit**

```bash
git add docs-site/docs/mqtt-integration.md
git commit -m "docs(mqtt): add HA example for incoming-call topic"
```

---

### Task 6: Changelog entry

**Files:**
- Create: `.changelog/pr-<PR_NUMBER>.txt` (same convention as `.changelog/pr-2406.txt`)

- [ ] **Step 1: Check existing changelog format**

```bash
ls .changelog/
cat .changelog/pr-2406.txt
```

- [ ] **Step 2: Create file matching the format, e.g.**

```text
- Added `{topicPrefix}/incoming-call` MQTT topic for home automation integration. Fires `"true"` on ring and `"false"` when the ring ends, parity with `incomingCallCommand`. (#2370)
```

- [ ] **Step 3: Commit**

```bash
git add .changelog/pr-<PR_NUMBER>.txt
git commit -m "chore: add changelog entry for PR #<PR_NUMBER>"
```

---

## Phase 2: Meeting-Starting Topic (Calendar-Driven Prediction)

**Trigger to start Phase 2:** Phase 1 ships and the requester confirms (a) incoming-call topic is working for them and (b) they still want scheduled-meeting-starting coverage; OR a second distinct user requests it.

### Task 7: Config additions

**Files:**
- Modify: `app/config/index.js` around line 520-534 (add `meetingStarting` nested under `mqtt`)

- [ ] **Step 1: Read current `mqtt` default block** at `app/config/index.js:520-534`.

- [ ] **Step 2: Add nested `meetingStarting` block**

```javascript
mqtt: {
  default: {
    enabled: false,
    brokerUrl: "",
    username: "",
    password: "",
    clientId: "teams-for-linux",
    topicPrefix: "teams",
    statusTopic: "status",
    commandTopic: "",
    statusCheckInterval: 10000,
    meetingStarting: {
      enabled: false,
      leadTimeSeconds: 120,
      pollIntervalSeconds: 300,
      lookAheadHours: 12,
    },
  },
  describe: "MQTT configuration for publishing Teams status updates and receiving action commands",
  type: "object",
},
```

Rationale for defaults: 120s lead-time gives users a clear "meeting starting soon" window; 300s Graph poll interval balances freshness against API quota; 12-hour look-ahead matches a workday horizon. All documented in `configuration.md`.

- [ ] **Step 3: Commit**

```bash
git add app/config/index.js
git commit -m "feat(mqtt): add mqtt.meetingStarting config defaults"
```

---

### Task 8: CalendarPollingService module

**Files:**
- Create: `app/mqtt/calendarPollingService.js`
- Create: `tests/unit/calendarPollingService.test.js`

- [ ] **Step 1: Write failing test for the tick behaviour**

```javascript
// tests/unit/calendarPollingService.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { EventEmitter } = require('node:events');

// Minimal mock: stub `electron` module BEFORE requiring the service
const mockApp = new EventEmitter();
require.cache[require.resolve('electron')] = { exports: { app: mockApp } };

const CalendarPollingService = require('../../app/mqtt/calendarPollingService');

test('publishes true when a cached event enters the lead-time window', async () => {
  const published = [];
  const mqttClient = { publish: async (t, p, o) => published.push({ t, p, o }) };
  const now = Date.now();
  const graphApiClient = {
    getCalendarView: async () => ({
      success: true,
      data: {
        value: [
          { id: 'evt-1', subject: 'Sprint', start: { dateTime: new Date(now + 60_000).toISOString() } },
        ],
      },
    }),
  };
  const service = new CalendarPollingService(mqttClient, graphApiClient, {
    topicPrefix: 'teams',
    leadTimeSeconds: 120,
    pollIntervalSeconds: 3600, // prevent re-poll during the test
    lookAheadHours: 12,
  });

  await service.refreshCache();
  await service.tick(now);

  const hit = published.find((p) => p.t === 'teams/meeting-starting' && p.p === 'true');
  assert.ok(hit, 'expected meeting-starting=true publish');
});

test('does not republish the same event while still in its window', async () => {
  const published = [];
  const mqttClient = { publish: async (t, p, o) => published.push({ t, p, o }) };
  const now = Date.now();
  const graphApiClient = {
    getCalendarView: async () => ({
      success: true,
      data: { value: [{ id: 'evt-1', subject: 'Sprint', start: { dateTime: new Date(now + 60_000).toISOString() } }] },
    }),
  };
  const service = new CalendarPollingService(mqttClient, graphApiClient, {
    topicPrefix: 'teams', leadTimeSeconds: 120, pollIntervalSeconds: 3600, lookAheadHours: 12,
  });

  await service.refreshCache();
  await service.tick(now);
  await service.tick(now + 5_000);
  await service.tick(now + 10_000);

  const trueHits = published.filter((p) => p.t === 'teams/meeting-starting' && p.p === 'true');
  assert.strictEqual(trueHits.length, 1);
});

test('publishes false after event start + grace period passes', async () => {
  const published = [];
  const mqttClient = { publish: async (t, p, o) => published.push({ t, p, o }) };
  const now = Date.now();
  const graphApiClient = {
    getCalendarView: async () => ({
      success: true,
      data: { value: [{ id: 'evt-1', subject: 'Sprint', start: { dateTime: new Date(now + 60_000).toISOString() } }] },
    }),
  };
  const service = new CalendarPollingService(mqttClient, graphApiClient, {
    topicPrefix: 'teams', leadTimeSeconds: 120, pollIntervalSeconds: 3600, lookAheadHours: 12,
  });

  await service.refreshCache();
  await service.tick(now);                    // enters window, publishes true
  await service.tick(now + 60_000 + 61_000);  // 1s past start+grace, should publish false

  const falseHit = published.find((p) => p.t === 'teams/meeting-starting' && p.p === 'false');
  assert.ok(falseHit, 'expected meeting-starting=false publish after grace period');
});
```

- [ ] **Step 2: Run test, confirm failure**

```bash
node --test tests/unit/calendarPollingService.test.js
```

Expected: all tests fail (module does not exist).

- [ ] **Step 3: Create `app/mqtt/calendarPollingService.js`**

```javascript
const { app } = require('electron');

/**
 * Polls Microsoft Graph calendar and publishes a boolean MQTT topic when a
 * scheduled meeting is about to start. This is schedule-based prediction,
 * not Teams-event detection — the topic fires based on calendar start time,
 * regardless of whether the user joins.
 *
 * Publishes to:
 * - {topicPrefix}/meeting-starting - "true" when an event enters the lead-time window, "false" after it passes
 */
class CalendarPollingService {
  #mqttClient;
  #graphApiClient;
  #config;
  #cache = [];         // [{ id, startMs }]
  #activeEventId = null;
  #cacheTimer = null;
  #tickTimer = null;

  constructor(mqttClient, graphApiClient, config) {
    this.#mqttClient = mqttClient;
    this.#graphApiClient = graphApiClient;
    this.#config = config;
  }

  start() {
    this.refreshCache().catch((err) => console.error('[CalendarPolling] initial refresh failed', { message: err.message }));
    this.#cacheTimer = setInterval(
      () => this.refreshCache().catch((err) => console.error('[CalendarPolling] refresh failed', { message: err.message })),
      this.#config.pollIntervalSeconds * 1000
    );
    this.#tickTimer = setInterval(
      () => this.tick(Date.now()).catch((err) => console.error('[CalendarPolling] tick failed', { message: err.message })),
      15_000
    );
    app.on('before-quit', () => this.stop());
    console.info('[CalendarPolling] Started');
  }

  stop() {
    if (this.#cacheTimer) clearInterval(this.#cacheTimer);
    if (this.#tickTimer) clearInterval(this.#tickTimer);
    this.#cacheTimer = null;
    this.#tickTimer = null;
  }

  async refreshCache() {
    const now = new Date();
    const end = new Date(now.getTime() + this.#config.lookAheadHours * 3600_000);
    const result = await this.#graphApiClient.getCalendarView(now.toISOString(), end.toISOString());
    if (!result?.success) return;
    this.#cache = (result.data?.value ?? [])
      .filter((e) => e.start?.dateTime)
      .map((e) => ({ id: e.id, startMs: Date.parse(e.start.dateTime) }))
      .sort((a, b) => a.startMs - b.startMs);
  }

  async tick(nowMs) {
    const leadMs = this.#config.leadTimeSeconds * 1000;
    const graceMs = 60_000;

    if (this.#activeEventId) {
      const active = this.#cache.find((e) => e.id === this.#activeEventId);
      // Clear if meeting deleted, grace period passed, or rescheduled out of the lead window
      if (!active || nowMs > active.startMs + graceMs || active.startMs - nowMs > leadMs) {
        await this.#publish('false');
        this.#activeEventId = null;
      }
      return;
    }

    const imminent = this.#cache.find((e) => e.startMs - nowMs <= leadMs && e.startMs - nowMs > -graceMs);
    if (imminent) {
      this.#activeEventId = imminent.id;
      await this.#publish('true');
    }
  }

  async #publish(value) {
    const topic = `${this.#config.topicPrefix}/meeting-starting`;
    await this.#mqttClient.publish(topic, value, { retain: true });
    console.debug('[CalendarPolling] Published', value, 'to', topic);
  }
}

module.exports = CalendarPollingService;
```

- [ ] **Step 4: Run tests, confirm pass**

```bash
node --test tests/unit/calendarPollingService.test.js
```

Expected: all three tests PASS.

- [ ] **Step 5: Run lint**

```bash
npm run lint
```

- [ ] **Step 6: Commit**

```bash
git add app/mqtt/calendarPollingService.js tests/unit/calendarPollingService.test.js
git commit -m "feat(mqtt): calendar-driven meeting-starting publisher"
```

---

### Task 9: Wire CalendarPollingService into `app/index.js`

**Files:**
- Modify: `app/index.js` (initialize the service after MQTT and Graph API clients are both ready)

- [ ] **Step 1: Read current initialization order of mqttClient and graphApiClient in `app/index.js`.** The existing `MQTTMediaStatusService` initialization around line 300-301 is the reference pattern.

- [ ] **Step 2: Initialize CalendarPollingService only when all three of these are true**

- `config.mqtt.enabled`
- `config.mqtt.meetingStarting.enabled`
- `config.graphApi.enabled` (log a warning and skip if meetingStarting is enabled without Graph API)

```javascript
const CalendarPollingService = require('./mqtt/calendarPollingService');
// ... after mqttClient and graphApiClient are initialized ...

if (config.mqtt.enabled && config.mqtt.meetingStarting.enabled) {
  if (!config.graphApi.enabled) {
    console.warn('[App] mqtt.meetingStarting.enabled is true but graphApi.enabled is false — skipping CalendarPollingService');
  } else {
    const calendarPollingService = new CalendarPollingService(
      mqttClient,
      graphApiClient,
      {
        topicPrefix: config.mqtt.topicPrefix,
        leadTimeSeconds: config.mqtt.meetingStarting.leadTimeSeconds,
        pollIntervalSeconds: config.mqtt.meetingStarting.pollIntervalSeconds,
        lookAheadHours: config.mqtt.meetingStarting.lookAheadHours,
      }
    );
    calendarPollingService.start();
  }
}
```

- [ ] **Step 3: Run lint**

```bash
npm run lint
```

- [ ] **Step 4: Commit**

```bash
git add app/index.js
git commit -m "feat(mqtt): initialize CalendarPollingService when enabled"
```

---

### Task 10: Documentation for Phase 2

**Files:**
- Modify: `docs-site/docs/configuration.md` (Published Topics table + new config section)
- Modify: `app/mqtt/README.md`
- Modify: `docs-site/docs/mqtt-integration.md` (add HA example)
- Modify: `docs-site/docs/development/plan/roadmap.md` (update #2370 status)

- [ ] **Step 1: Add `meeting-starting` row to Published Topics table in `configuration.md`**

```markdown
| `\{topicPrefix\}/meeting-starting` | `"true"` or `"false"` | Scheduled meeting is about to start (calendar-driven prediction). Fires `"true"` when an event on the user's calendar enters the `leadTimeSeconds` window; fires `"false"` 60 seconds after the start time. Requires `mqtt.meetingStarting.enabled=true` AND `graphApi.enabled=true`. Does NOT detect whether Teams actually shows a join prompt — it's purely schedule-based. |
```

- [ ] **Step 2: Add `mqtt.meetingStarting.*` rows to the MQTT config table in `configuration.md`**

```markdown
| `mqtt.meetingStarting.enabled` | `boolean` | `false` | Publish calendar-driven `meeting-starting` events. Requires `graphApi.enabled=true`. |
| `mqtt.meetingStarting.leadTimeSeconds` | `number` | `120` | How many seconds before meeting start time to publish `"true"`. |
| `mqtt.meetingStarting.pollIntervalSeconds` | `number` | `300` | How often to refresh the calendar cache from Graph API. |
| `mqtt.meetingStarting.lookAheadHours` | `number` | `12` | How far ahead to cache calendar events. |
```

- [ ] **Step 3: Add HA automation example to `mqtt-integration.md`**

```yaml
automation:
  - alias: "Meeting starting soon — turn off vacuum"
    trigger:
      platform: mqtt
      topic: "teams/meeting-starting"
      payload: "true"
    action:
      service: vacuum.stop
      target:
        entity_id: vacuum.living_room
```

- [ ] **Step 4: Update roadmap** — move #2370 Phase 2 from "ready" to "shipped" and note the limitation (schedule-based, not Teams-event-based).

- [ ] **Step 5: Commit**

```bash
git add docs-site/docs/configuration.md docs-site/docs/mqtt-integration.md app/mqtt/README.md docs-site/docs/development/plan/roadmap.md
git commit -m "docs(mqtt): document meeting-starting topic and config"
```

---

### Task 11: Phase 2 changelog entry

**Files:**
- Create: `.changelog/pr-<PR_NUMBER>.txt`

- [ ] **Step 1: Create changelog entry**

```text
- Added `{topicPrefix}/meeting-starting` MQTT topic. Fires `"true"` when a scheduled calendar meeting enters the lead-time window and `"false"` after the start time passes. Requires `mqtt.meetingStarting.enabled` and `graphApi.enabled`. (#2370)
```

- [ ] **Step 2: Commit**

```bash
git add .changelog/pr-<PR_NUMBER>.txt
git commit -m "chore: add changelog entry for PR #<PR_NUMBER>"
```

---

## Open Questions Deferred to Future Phases

These stay YAGNI until a second distinct user requests them:

1. Caller identity or meeting subject in the payload. Phase 1 and 2 both ship boolean-only to avoid PII leaks on unencrypted local MQTT brokers.
2. Separate topics per call kind (`incoming-call/oneOnOne`, `incoming-call/group`, `incoming-call/channel`). Would require renderer-side classification that does not exist yet.
3. Detecting a scheduled meeting actually started (not just reached its start time). Teams does not reliably fire `isIncomingCall` for scheduled meeting joins; there is no known signal inside the app today.
4. Configurable per-topic retain flag or TTL. Current design uses `retain: true` for consistency with `in-call`; LWT handles crash cleanup.

---

## Verification Before Claiming Done

- [ ] `npm run lint` clean
- [ ] `node --test tests/unit/mediaStatusService.test.js` passes
- [ ] `node --test tests/unit/calendarPollingService.test.js` passes (Phase 2 only)
- [ ] Manual MQTT subscribe confirms `incoming-call` fires for a real 1:1 ring
- [ ] Manual MQTT subscribe confirms `meeting-starting` fires for a real scheduled meeting within the lead-time window (Phase 2 only)
- [ ] `npm run generate-ipc-docs` — no new IPC channels in Phase 1 or 2, so output should be unchanged. If it changes, investigate before committing.
- [ ] Documentation site builds: `cd docs-site && npm run build`

---

## References

- Issue: https://github.com/IsmaelMartinez/teams-for-linux/issues/2370
- Research: `docs-site/docs/development/research/mqtt-extended-status-investigation.md` (Phase 3 "Calendar & Meetings" section described this approach)
- Research: `docs-site/docs/development/research/mqtt-microphone-state-research.md`
- Research: `docs-site/docs/development/research/graph-api-integration-research.md`
- Adjacent fix (same infrastructure): PR [#2406](https://github.com/IsmaelMartinez/teams-for-linux/pull/2406) / issue [#2358](https://github.com/IsmaelMartinez/teams-for-linux/issues/2358) — added `activityHub.emit()` and activated WebRTC patching under `mqtt.enabled`
- Pattern reference: `app/mqtt/mediaStatusService.js` (existing IPC→MQTT bridge)
- Pattern reference: `app/mainAppWindow/browserWindowManager.js:244` (`app.emit('teams-call-connected')` precedent)
