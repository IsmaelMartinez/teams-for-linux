// Smartcard / NSS PIN handler spike — issue #2639
//
// Standalone Electron main script that answers the spike questions in
// docs-site/docs/development/research/smartcard-nss-pin-dialog-research.md
// WITHOUT touching the Teams for Linux app code.
//
// Run from the repo root (after `npm install`):
//
//   npx electron testing/spikes/smartcard-pin-spike/main.mjs [url]
//
// Default URL is the client-certificate test endpoint https://prod.idrix.eu/secure/
//
// ┌──────────────────────────────────────────────────────────────────────┐
// │  ⚠️  SAFETY: run the cancel / wrong-PIN experiments ONLY against a   │
// │  SoftHSM2 token or a disposable test card. Real smartcards hard-lock │
// │  after ~3 wrong PIN attempts and the spike deliberately exercises    │
// │  failure paths. Check the remaining-attempts counter with your       │
// │  middleware (e.g. `pkcs11-tool --module <lib> --login --test`) before│
// │  and after EACH experiment so you can attribute every decrement.     │
// └──────────────────────────────────────────────────────────────────────┘
//
// This is a spike: it favors observability over hardening (the PIN window
// uses nodeIntegration for brevity). Do NOT copy this dialog into the app —
// the production design mandates contextIsolation + sandbox (see research doc).

import { app, BrowserWindow, dialog, ipcMain } from "electron";

const targetUrl = process.argv[2] ?? "https://prod.idrix.eu/secure/";
let pinHandlerCalls = 0;
let certSelectCalls = 0;

if (process.platform !== "linux") {
  // Q0: the API is Linux-only; on other platforms it must not be registered.
  console.error("[SPIKE] setClientCertRequestPasswordHandler is Linux-only; nothing to test on", process.platform);
  app.quit();
}

function pinPrompt({ hostname, tokenName, isRetry }) {
  return new Promise((resolve, reject) => {
    const win = new BrowserWindow({
      width: 460,
      height: 300,
      alwaysOnTop: true,
      autoHideMenuBar: true,
      title: "SPIKE PIN prompt",
      webPreferences: { nodeIntegration: true, contextIsolation: false },
    });

    const html = /* html */ `<!doctype html><meta charset="utf-8">
      <body style="font-family:sans-serif;padding:12px">
        <h3>PIN for token: ${tokenName}</h3>
        <p>Requested by host: ${hostname}</p>
        <p style="color:${isRetry ? "red" : "green"}">isRetry = ${isRetry}</p>
        <input id="pin" type="password" autofocus style="width:100%">
        <p>
          <button onclick="send('submit')">Submit PIN</button>
          <button onclick="send('empty')">Cancel → resolve(&quot;&quot;)</button>
          <button onclick="send('reject')">Cancel → reject()</button>
        </p>
        <script>
          const { ipcRenderer } = require("electron");
          function send(action) {
            ipcRenderer.send("spike-pin", { action, pin: document.getElementById("pin").value });
          }
          document.getElementById("pin").addEventListener("keydown", (e) => {
            if (e.key === "Enter") send("submit");
          });
        </script>
      </body>`;

    let settled = false;
    const settle = (fn, label, value) => {
      if (settled) return;
      settled = true;
      ipcMain.removeListener("spike-pin", onMessage);
      console.log(`[SPIKE][PIN] call #${pinHandlerCalls} settled via: ${label}`);
      win.close();
      fn(value);
    };

    const onMessage = (_event, { action, pin }) => {
      if (action === "submit") settle(resolve, "submit (PIN entered)", pin);
      else if (action === "empty") settle(resolve, 'resolve("") — watch the attempts counter!', "");
      else settle(reject, "reject(Error) — watch the attempts counter!", new Error("spike: user cancelled"));
    };

    ipcMain.on("spike-pin", onMessage);
    win.on("closed", () => settle(reject, "window closed → reject", new Error("spike: window closed")));
    win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html));
  });
}

app.whenReady().then(() => {
  // Q1/Q2/Q5: does the handler fire, with what payload, and how often?
  app.setClientCertRequestPasswordHandler((req) => {
    pinHandlerCalls += 1;
    console.log(`[SPIKE][PIN] handler call #${pinHandlerCalls}:`, JSON.stringify(req));
    return pinPrompt(req);
  });

  // Q6: does select-client-certificate fire, and with which certificates?
  app.on("select-client-certificate", (event, _webContents, url, certificateList, callback) => {
    certSelectCalls += 1;
    event.preventDefault();
    console.log(`[SPIKE][CERT] select-client-certificate call #${certSelectCalls} for ${url}`);
    certificateList.forEach((c, i) =>
      console.log(`[SPIKE][CERT]   [${i}] subject="${c.subjectName}" issuer="${c.issuerName}" serial=${c.serialNumber}`),
    );
    if (certificateList.length === 0) return callback();
    if (certificateList.length === 1) return callback(certificateList[0]);
    const choice = dialog.showMessageBoxSync({
      type: "question",
      title: "SPIKE certificate picker",
      message: "Multiple client certificates available — pick one",
      buttons: certificateList.map((c, i) => `[${i}] ${c.subjectName}`),
    });
    callback(certificateList[choice]);
  });

  const win = new BrowserWindow({ width: 1000, height: 700 });
  console.log(`[SPIKE] loading ${targetUrl}`);
  console.log("[SPIKE] checklist: (1) handler fires? (2) tokenName correct? (3) resolve('') → isRetry/counter?");
  console.log("[SPIKE]            (4) reject → counter? (5) calls per request or per unlock (reload the page)?");
  console.log("[SPIKE]            (6) cert list contents? (7) page shows your certificate after correct PIN?");
  win.loadURL(targetUrl);
});

app.on("window-all-closed", () => {
  console.log(`[SPIKE] totals: PIN handler calls=${pinHandlerCalls}, cert-select calls=${certSelectCalls}`);
  app.quit();
});
