const { app, BrowserWindow, session, nativeTheme } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');

const ownsProfile = !process.env.TEAMS_PHONE_TEST_PROFILE;
const profile = process.env.TEAMS_PHONE_TEST_PROFILE || fs.mkdtempSync(path.join(os.tmpdir(), 'teams-phone-relay-'));
const helper = path.join(profile, 'helper');
app.setPath('userData', profile);
fs.writeFileSync(helper, fs.readFileSync(path.join(__dirname, 'phone-helper.cjs')), { mode: 0o755 });
const scenarios = process.env.TEAMS_PHONE_TEST_SCENARIO
  ? [process.env.TEAMS_PHONE_TEST_SCENARIO] : ['relay', 'prompt', 'lifecycle'];
const deadline = setTimeout(() => { console.error('Phone fixture timed out'); finish(1); }, 20000);
let direct;

function finish(code) {
  clearTimeout(deadline);
  direct?.dispose();
  for (const window of BrowserWindow.getAllWindows()) window.destroy();
  if (ownsProfile) fs.rmSync(profile, { recursive: true, force: true });
  app.exit(code);
}

function loginDocument(request) {
  const url = new URL(request.url);
  let body = '<!doctype html><title>Login fixture</title>';
  if (url.hostname === 'login.microsoftonline.com') {
    body = `<!doctype html>
      <iframe src="https://login.microsoft.com/test" allow="publickey-credentials-get"></iframe>
      <iframe src="https://login.microsoft.com/denied" allow="publickey-credentials-get 'none'"></iframe>`;
  } else if (url.pathname === '/test') {
    body = '<!doctype html><iframe src="https://login.live.com/nested" allow="publickey-credentials-get"></iframe>';
  }
  return new Response(body, { headers: {
    'Content-Type': 'text/html',
    'Permissions-Policy': 'publickey-credentials-get=(self "https://login.microsoft.com" "https://login.live.com")',
  } });
}

async function injectedFrame(win, suffix) {
  // Polling must wait between checks until frame injection completes.
  for (let attempt = 0; attempt < 100; attempt++) {
    const frame = win.webContents.mainFrame.framesInSubtree.find((candidate) => candidate !== win.webContents.mainFrame && candidate.url.endsWith(suffix));
    if (frame && await frame.executeJavaScript('!!window.__webauthnOverrideInjected')) return frame;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Login frame override missing: ${suffix}`);
}

function assertionScript(timeout = 5000) {
  return `navigator.credentials.get({ publicKey: {
    challenge: new Uint8Array([1,2,3]), rpId: location.hostname, timeout: ${timeout}
  } }).then(c => ({
    credential: c instanceof PublicKeyCredential,
    response: c.response instanceof AuthenticatorAssertionResponse,
    client: JSON.parse(new TextDecoder().decode(c.response.clientDataJSON)),
    node: typeof require
  }))`;
}

async function checkRelay(win) {
  const frame = await injectedFrame(win, '/test');
  const nested = await injectedFrame(win, '/nested');
  const targets = [
    [win.webContents, 'https://login.microsoftonline.com', undefined],
    [frame, 'https://login.microsoft.com', 'https://login.microsoftonline.com'],
    [nested, 'https://login.live.com', 'https://login.microsoftonline.com'],
  ];
  await Promise.all(targets.map(async ([target, origin, top]) => {
    // Regress the integer-seconds conversion that rounded 500ms down to zero.
    const result = await target.executeJavaScript(assertionScript(500));
    assert.equal(result.credential, true);
    assert.equal(result.response, true);
    assert.equal(result.node, 'undefined');
    assert.equal(result.client.origin, origin);
    assert.equal(result.client.topOrigin, top);
    const aborted = await target.executeJavaScript(`(async () => {
      const controller = new AbortController();
      const pending = navigator.credentials.get({ signal: controller.signal,
        publicKey: { challenge: new Uint8Array([4,5,6]), timeout: 5000 }
      }).catch(e => e.name);
      setTimeout(() => controller.abort(), 30);
      return pending;
    })()`);
    assert.equal(aborted, 'AbortError');
  }));
  const denied = await injectedFrame(win, '/denied');
  const error = await denied.executeJavaScript(
    'navigator.credentials.get({publicKey:{challenge:new Uint8Array([1,2,3])}}).catch(e=>e.name)');
  assert.equal(error, 'SecurityError');
}

async function checkPrompt(win) {
  let checked = 0;
  let cancel = false;
  const onCreated = (_event, prompt) => {
    if (prompt === win) return;
    prompt.webContents.once('did-finish-load', async () => {
      try {
        assert.equal(prompt.isMenuBarVisible(), false);
        const state = await prompt.webContents.executeJavaScript(`({
          css: !!document.querySelector('link[rel=stylesheet]'),
          inline: !!document.querySelector('style'),
          background: getComputedStyle(document.body).backgroundColor,
          csp: document.querySelector('[http-equiv="Content-Security-Policy"]').content
        })`);
        assert.equal(state.css, true);
        assert.equal(state.inline, false);
        assert.equal(state.background, nativeTheme.shouldUseDarkColors ? 'rgb(30, 31, 34)' : 'rgb(255, 255, 255)');
        assert.ok(state.csp.includes("style-src 'self'"));
        checked++;
        if (cancel) await prompt.webContents.executeJavaScript('document.getElementById("cancel").click()');
      } catch (error) {
        console.error(error.stack);
        finish(1);
      }
    });
  };
  app.on('browser-window-created', onCreated);
  const get = 'navigator.credentials.get({publicKey:{challenge:new Uint8Array([7,8,9]),timeout:5000}})';
  try {
    nativeTheme.themeSource = 'dark';
    await win.webContents.executeJavaScript(`${get}.then(() => true)`);
    assert.equal(checked, 1);
    nativeTheme.themeSource = 'light';
    cancel = true;
    assert.equal(await win.webContents.executeJavaScript(`${get}.catch(e => e.name)`), 'AbortError');
    assert.equal(checked, 2);
  } finally {
    app.removeListener('browser-window-created', onCreated);
    nativeTheme.themeSource = 'system';
  }
}

async function checkLifecycle(win) {
  const adapterPath = process.env.TEAMS_PHONE_PACKAGE_ASAR
    ? path.join(process.env.TEAMS_PHONE_PACKAGE_ASAR, 'app/webauthn/phoneBackend')
    : '../../../app/webauthn/phoneBackend';
  direct = require(adapterPath).createPhoneBackend({ electron: require('electron'), helperPath: helper,
    mainWindow: win, origins: new Set(['https://login.microsoftonline.com']) });
  const begin = (id) => direct.handle('get', { sender: win.webContents, senderFrame: win.webContents.mainFrame },
    { requestId: id, challenge: 'BAUG', timeout: 5 });
  const navigating = begin('navigation-probe');
  await win.loadURL('https://login.microsoftonline.com/after');
  assert.match((await navigating).error, /AbortError/);
  const crashing = begin('renderer-loss-probe');
  win.webContents.forcefullyCrashRenderer();
  assert.match((await crashing).error, /AbortError/);
  direct.dispose();
  direct = null;
}

async function main() {
  try {
    await app.whenReady();
    session.defaultSession.protocol.handle('https', loginDocument);
    const win = new BrowserWindow({ show: false, webPreferences: {
      preload: path.join(__dirname, 'phone-preload.cjs'), contextIsolation: false,
      sandbox: false, nodeIntegration: false,
    } });
    const webauthn = process.env.TEAMS_PHONE_PACKAGE_ASAR
      ? require(path.join(process.env.TEAMS_PHONE_PACKAGE_ASAR, 'app/webauthn'))
      : require('../../../app/webauthn');
    await webauthn.initialize(win, { auth: { webauthn: { enabled: true, backend: 'phone', helperPath: helper } } });
    await win.loadURL('https://login.microsoftonline.com/test');
    const checks = { relay: checkRelay, prompt: checkPrompt, lifecycle: checkLifecycle };
    // Scenarios mutate the same window and backend, so keep them ordered.
    for (const scenario of scenarios) {
      assert.ok(checks[scenario], `Unknown phone test scenario: ${scenario}`);
      await checks[scenario](win);
      console.log(`PASS: phone ${scenario}`);
    }
    finish(0);
  } catch (error) {
    console.error(error.stack);
    finish(1);
  }
}
void main();
