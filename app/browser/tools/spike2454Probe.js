// SPIKE-2454: Diagnostic probe for Agenda/Loop missing in meeting-compose.
// Runs in the renderer preload, captures iframe lifecycle, postMessages,
// React-store category state, and force-attempts a teams-js v2 initialize
// handshake to the OWA hosted-calendar iframe. All output prefixed with
// [SPIKE-2454] and goes through console.info so it surfaces in stderr.

class Spike2454Probe {
  init(config) {
    this.config = config;
    this.startedAt = Date.now();
    this.iframeSeen = false;
    this.handshakeSent = false;
    this.portReplies = [];
    this.winReplies = [];
    this.timeline = [];

    globalThis.__spike2454 = this;

    this._log('init', { url: globalThis.location?.href });

    // Capture all messages from outlook.office.com on the window
    globalThis.addEventListener('message', (e) => this._onWindowMessage(e), true);

    // Look for the OWA iframe via mutation observer + periodic poll
    this._watchForIframe();

    // Poll for the Teams React store + recheck periodically
    this._watchForReactStore();
  }

  _log(event, data) {
    const entry = { t: Date.now() - this.startedAt, event, ...(data || {}) };
    this.timeline.push(entry);
    try {
      console.info('[SPIKE-2454]', JSON.stringify(entry));
    } catch {
      console.info('[SPIKE-2454]', event, data);
    }
  }

  _serialize(v) {
    try { return JSON.parse(JSON.stringify(v || null)); }
    catch { return String(v).slice(0, 300); }
  }

  _watchForIframe() {
    const find = () => {
      const f = document.querySelector('iframe[src*="outlook.office.com/hosted/calendar"]');
      if (f && !this.iframeSeen) {
        this.iframeSeen = true;
        this.iframe = f;
        const rect = f.getBoundingClientRect();
        this._log('iframe-found', {
          src: f.src,
          width: rect.width,
          height: rect.height,
          x: rect.x,
          y: rect.y,
          parentDisplay: f.parentElement && getComputedStyle(f.parentElement).display,
          visibility: getComputedStyle(f).visibility,
          hasContentWindow: !!f.contentWindow,
        });
        // SPIKE-2454: handshake disabled in pure-observation mode.
        // this._attemptHandshake();
        return true;
      }
      return false;
    };

    if (!find()) {
      try {
        new MutationObserver(() => find()).observe(document.body, { childList: true, subtree: true });
      } catch { /* document.body may not be ready yet */ }
      const interval = setInterval(() => {
        if (find()) clearInterval(interval);
      }, 500);
      setTimeout(() => clearInterval(interval), 90_000);
    }

    // Periodic snapshot for 60 s to catch state changes when user opens "New meeting"
    let snapCount = 0;
    const snapper = setInterval(() => {
      if (this.iframe) {
        const rect = this.iframe.getBoundingClientRect();
        this._log('iframe-snapshot', {
          src: this.iframe.src,
          width: rect.width,
          height: rect.height,
          parentDisplay: this.iframe.parentElement && getComputedStyle(this.iframe.parentElement).display,
          visibility: getComputedStyle(this.iframe).visibility,
        });
      }
      if (++snapCount >= 12) clearInterval(snapper);
    }, 5_000);
  }

  _attemptHandshake() {
    if (this.handshakeSent) return;
    if (!this.iframe?.contentWindow) {
      this._log('handshake-skip', { reason: 'no contentWindow' });
      return;
    }
    this.handshakeSent = true;

    const channel = new MessageChannel();
    this.port = channel.port1;
    this.port.onmessage = (e) => {
      const data = this._serialize(e.data);
      this.portReplies.push(data);
      this._log('port-reply', { idx: this.portReplies.length, data });
    };
    this.port.start();

    const now = Date.now();
    const envelope = {
      id: 0,
      uuid: (globalThis.crypto?.randomUUID && globalThis.crypto.randomUUID()) || `manual-${now}`,
      func: 'initialize',
      args: ['v2'],
      apiVersionTag: 'v2_app.initialize',
      timestamp: now,
      monotonicTimestamp: performance.now(),
      isProxiedFromChild: false,
      teamsJsInstanceId: (globalThis.crypto?.randomUUID && globalThis.crypto.randomUUID()) || `tjs-${now}`,
    };

    try {
      this.iframe.contentWindow.postMessage(envelope, 'https://outlook.office.com', [channel.port2]);
      this._log('handshake-sent', { envelope });
    } catch (err) {
      this._log('handshake-error', { err: err?.message || String(err) });
    }
  }

  _onWindowMessage(e) {
    if (e.origin === 'https://outlook.office.com') {
      const data = this._serialize(e.data);
      this.winReplies.push(data);
      this._log('win-message-from-outlook', { idx: this.winReplies.length, data });
      // SPIKE-2454: responder disabled — pure observation pass to test
      // whether unblocking telemetry alone unblocks the Agenda flow.
      // this._maybeRespondToOwa(e.data, e.source);
    }
  }

  _maybeRespondToOwa(req, source) {
    if (!req || typeof req !== 'object') return;
    if (typeof req.id !== 'number') return;
    if (!req.func) return;
    // Don't respond to notifications (no reply expected by teams-js)
    if (req.func === 'appInitialization.appLoaded' || req.func === 'appInitialization.success') return;
    if (req.func === 'initialize') return; // child's initialize ack
    if (req.func === 'registerHandler') return; // notification-shaped
    if (req.func === 'sendCustomMessage' || req.apiVersionTag === 'v1_sendCustomMessage') return;

    let result;
    let ok = true;
    try {
      switch (req.func) {
        case 'getContext':
          result = this._buildFakeContext();
          break;
        case 'authentication.getAuthToken':
          // args[0] is array of resources; reply with empty token for now.
          // OWA will likely reject empty tokens but we want to see how it reacts.
          result = '';
          break;
        case 'getConfigSetting':
          result = '';
          break;
        default:
          // Echo back null for anything else with an id, so OWA's promise resolves
          result = null;
      }
    } catch (err) {
      ok = false;
      result = err?.message || String(err);
    }

    const response = {
      id: req.id,
      uuid: (globalThis.crypto?.randomUUID && globalThis.crypto.randomUUID()) || `resp-${Date.now()}`,
      func: req.func,
      args: [result],
      timestamp: Date.now(),
      monotonicTimestamp: performance.now(),
      isProxiedFromChild: false,
      teamsJsInstanceId: req.teamsJsInstanceId,
    };

    try {
      const target = source || this.iframe?.contentWindow;
      target?.postMessage(response, 'https://outlook.office.com');
      this._log('responded-to-owa', { func: req.func, id: req.id, ok, preview: this._serialize(result) });
    } catch (err) {
      this._log('response-error', { func: req.func, id: req.id, err: err?.message || String(err) });
    }
  }

  _buildFakeContext() {
    // Minimal teams-js v2 Context shape. Fields are best-effort guesses to satisfy
    // OWA's expectations. If OWA proceeds further, we know the shape is acceptable.
    const sessionId = (globalThis.crypto?.randomUUID && globalThis.crypto.randomUUID()) || `sess-${Date.now()}`;
    return {
      app: {
        theme: 'default',
        locale: 'en-us',
        sessionId,
        host: {
          name: 'Teams',
          clientType: 'web',
          ringId: 'general',
          sessionId,
        },
        appLaunchId: undefined,
        parentMessageId: undefined,
        userClickTime: 0,
        userFileOpenPreference: '',
        iconPositionVertical: 0,
        osLocaleInfo: {
          platform: 'web',
          regionalFormat: 'en-us',
          longDate: '',
          longTime: '',
          shortDate: '',
          shortTime: '',
        },
      },
      page: {
        id: 'spike-2454-page',
        frameContext: 'content',
        subPageId: undefined,
        isFullScreen: false,
        sourceOrigin: 'https://teams.cloud.microsoft',
        isMultiWindow: false,
        isBackgroundLoad: false,
      },
      user: {
        id: '',
        displayName: '',
        isCallingAllowed: true,
        isPSTNCallingAllowed: true,
        licenseType: '',
        loginHint: '',
        userPrincipalName: '',
        tenant: { id: '', teamsSku: '' },
      },
      channel: undefined,
      chat: undefined,
      meeting: undefined,
      team: undefined,
      sharePointSite: undefined,
    };
  }

  _getCoreSettings() {
    try {
      const app = document.getElementById('app');
      const root = app?._reactRootContainer?._internalRoot || app?._reactRootContainer;
      const props = root?.current?.updateQueue?.baseState?.element?.props;
      const coreServices = props?.coreServices || props?.children?.props?.coreServices;
      return coreServices?.coreSettings || null;
    } catch {
      return null;
    }
  }

  _watchForReactStore() {
    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      const cs = this._getCoreSettings();
      if (cs) {
        clearInterval(interval);
        const cats = Array.from(cs.categoryBehaviorSubjectMap?.keys?.() || []);
        this._log('react-store-ready', {
          attempts,
          categoryCount: cats.length,
          hasOutlook: cats.includes('outlook'),
          hasAi: cats.includes('ai'),
          hasMeetingBot: cats.includes('meetingBot'),
          hasExperienceLoader: cats.includes('experienceLoader'),
        });

        let recheckCount = 0;
        const recheck = setInterval(() => {
          const c = Array.from(cs.categoryBehaviorSubjectMap?.keys?.() || []);
          this._log('react-store-recheck', {
            count: c.length,
            hasOutlook: c.includes('outlook'),
            hasAi: c.includes('ai'),
            hasMeetingBot: c.includes('meetingBot'),
          });
          if (++recheckCount >= 12) clearInterval(recheck);
        }, 5_000);
      }
      if (attempts > 60) clearInterval(interval);
    }, 1_000);
  }
}

module.exports = new Spike2454Probe();
