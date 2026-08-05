# MQTT Incoming Call & Meeting-Starting Topics Implementation Plan

:::important For agentic workers
REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
:::

:::warning Status, updated 2026-07-29
Phase 1 (the `{topicPrefix}/incoming-call` topic) shipped in PR #2572 and its task detail has been removed from this plan; see git history if you need it.

Phase 2 below proposes calendar polling to predict a meeting start. That approach is probably obsolete: live validation on 2026-07-29 (issue #2587, PR #2757) showed Teams announces a started meeting through its own command-reporting stream as structured data, which detects the real event rather than predicting it from the calendar. Keep this plan only if calendar-based prediction is still wanted as a fallback for tenants where the command stream is unavailable, otherwise delete it.
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
- Research history: see git history for `docs-site/docs/development/research/mqtt-extended-status-investigation.md` (its Phase 3 "Calendar & Meetings" section described this approach)
- Shipped: MQTT microphone state — [PR #2497](https://github.com/IsmaelMartinez/teams-for-linux/pull/2497)
- Research: `docs-site/docs/development/research/graph-api-integration-research.md`
- Adjacent fix (same infrastructure): PR [#2406](https://github.com/IsmaelMartinez/teams-for-linux/pull/2406) / issue [#2358](https://github.com/IsmaelMartinez/teams-for-linux/issues/2358) — added `activityHub.emit()` and activated WebRTC patching under `mqtt.enabled`
- Pattern reference: `app/mqtt/mediaStatusService.js` (existing IPC→MQTT bridge)
- Pattern reference: `app/mainAppWindow/browserWindowManager.js:244` (`app.emit('teams-call-connected')` precedent)
