'use strict';

// Unit tests for app/menus/attachmentDownload.js — the context-menu attachment
// download pipeline. The URL/filename helpers are tested directly; the generic
// http(s) "fetch → save → clipboard" path is exercised end-to-end against a
// local HTTP server. The Microsoft/SharePoint hidden-window paths need an
// authenticated Teams session and are out of scope here.

const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');

// ---- mock electron + electron-updater (loaded transitively) ----
let docsDir;
const clipboardCalls = [];
const notifications = [];

const electronMock = {
  app: {
    getPath: (k) => (k === 'documents' ? docsDir : os.tmpdir()),
    getVersion: () => '2.11.1',
    getName: () => 'teams-for-linux',
    on: () => {},
  },
  Notification: class {
    constructor(o) { this.o = o; notifications.push(o); }
    show() {}
    close() {}
    on() {}
  },
  clipboard: {
    writeText: (t) => clipboardCalls.push(['writeText', t]),
    writeBuffer: (fmt, buf) => clipboardCalls.push(['writeBuffer', fmt, buf.toString()]),
  },
  BrowserWindow: class {},
};
const updaterMock = { autoUpdater: { on: () => {} } };

const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'electron') return electronMock;
  if (request === 'electron-updater') return updaterMock;
  return origLoad.call(this, request, parent, isMain);
};

const dl = require('../../app/menus/attachmentDownload');

// ---- pure helpers ----
test('isMicrosoftHost: real M365 hosts match by suffix', () => {
  assert.strictEqual(dl.isMicrosoftHost('https://contoso.sharepoint.com/x'), true);
  assert.strictEqual(dl.isMicrosoftHost('https://x.onedrive.com/y'), true);
  assert.strictEqual(dl.isMicrosoftHost('https://contoso.sharepoint.com.eu.mcas.ms/z'), true);
});

test('isMicrosoftHost: lookalike and substring hosts are rejected', () => {
  assert.strictEqual(dl.isMicrosoftHost('https://notmicrosoft.evil.com/x'), false);
  assert.strictEqual(dl.isMicrosoftHost('https://backoffice.example.com/x'), false);
  assert.strictEqual(dl.isMicrosoftHost('https://sharepoint.com.evil.com/x'), false);
});

test('isMicrosoftHost: non-http(s) schemes rejected', () => {
  assert.strictEqual(dl.isMicrosoftHost('file:///etc/passwd'), false);
  assert.strictEqual(dl.isMicrosoftHost('not a url'), false);
});

test('getDirectDownloadUrl: adds download=1 only for MS hosts', () => {
  assert.match(dl.getDirectDownloadUrl('https://contoso.sharepoint.com/a.docx'), /[?&]download=1/);
  assert.strictEqual(dl.getDirectDownloadUrl('https://example.com/a.zip'), 'https://example.com/a.zip');
});

test('isTextFile: by extension and by SharePoint /:t:/ viewer marker', () => {
  assert.strictEqual(dl.isTextFile('https://x/file.txt'), true);
  assert.strictEqual(dl.isTextFile('https://x/file.json'), true);
  assert.strictEqual(dl.isTextFile('https://x/file.docx'), false);
  assert.strictEqual(dl.isTextFile('https://contoso.sharepoint.com/:t:/r/sites/x/y.aspx'), true);
});

test('sanitizeFilename: strips path segments and rejects traversal', () => {
  assert.strictEqual(dl.sanitizeFilename('../../.zshrc'), '.zshrc');
  assert.strictEqual(dl.sanitizeFilename('a\\b\\c.txt'), 'c.txt');
  assert.strictEqual(dl.sanitizeFilename('plain.pdf'), 'plain.pdf');
  assert.strictEqual(dl.sanitizeFilename('   '), 'attachment');
  assert.strictEqual(dl.sanitizeFilename('..'), 'attachment');
  assert.strictEqual(dl.sanitizeFilename(undefined), 'attachment');
});

test('stripViewerTitleSuffix: removes known viewer suffixes only', () => {
  assert.strictEqual(dl.stripViewerTitleSuffix('notes.txt - SharePoint'), 'notes.txt');
  assert.strictEqual(dl.stripViewerTitleSuffix('data.csv - OneDrive'), 'data.csv');
  assert.strictEqual(dl.stripViewerTitleSuffix('my - file.txt'), 'my - file.txt');
});

test('getSharePointDownloadUrl: rewrites viewer URL to download.aspx', () => {
  const out = dl.getSharePointDownloadUrl('https://contoso.sharepoint.com/:w:/r/sites/Team/Doc.docx');
  assert.ok(out && out.includes('/_layouts/15/download.aspx') && out.includes('SourceUrl='), out);
  assert.strictEqual(dl.getSharePointDownloadUrl('https://example.com/a.docx'), null);
});

test('applyMcasProxy: rewrites host only when the main window is MCAS-proxied', () => {
  const proxied = dl.applyMcasProxy('https://contoso.sharepoint.com/a', 'https://contoso.sharepoint.com.eu2.mcas.ms/');
  assert.ok(proxied.includes('.mcas.ms'), proxied);
  assert.strictEqual(
    dl.applyMcasProxy('https://x.sharepoint.com/a', 'https://teams.microsoft.com/'),
    'https://x.sharepoint.com/a',
  );
});

test('uniqueFilePath: appends (n) on collision', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uniq-'));
  assert.strictEqual(dl.uniqueFilePath(dir, 'r.pdf'), path.join(dir, 'r.pdf'));
  fs.writeFileSync(path.join(dir, 'dup.pdf'), 'x');
  assert.strictEqual(dl.uniqueFilePath(dir, 'dup.pdf'), path.join(dir, 'dup (1).pdf'));
  fs.writeFileSync(path.join(dir, 'dup (1).pdf'), 'x');
  assert.strictEqual(dl.uniqueFilePath(dir, 'dup.pdf'), path.join(dir, 'dup (2).pdf'));
  fs.rmSync(dir, { recursive: true, force: true });
});

// ---- end-to-end generic-host download ----
function makeSession() {
  return {
    fetch: async (url) => {
      const r = await fetch(url);
      return {
        ok: r.ok, status: r.status, statusText: r.statusText,
        headers: { get: (h) => r.headers.get(h) },
        // The generic-host path streams response.body to disk.
        body: r.body,
        arrayBuffer: () => r.arrayBuffer(),
      };
    },
  };
}

function startServer() {
  const server = http.createServer((req, res) => {
    if (req.url === '/binary') {
      res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-disposition': 'attachment; filename="report.pdf"' });
      res.end(Buffer.from('PDF-BYTES-1234'));
    } else if (req.url === '/cdtraversal') {
      res.writeHead(200, { 'content-type': 'application/zip', 'content-disposition': 'attachment; filename="../../escape.zip"' });
      res.end(Buffer.from('ZIPDATA'));
    } else if (req.url === '/noheader/myfile.bin') {
      res.writeHead(200, { 'content-type': 'application/octet-stream' });
      res.end(Buffer.from('RAW'));
    } else {
      res.writeHead(404); res.end();
    }
  });
  return new Promise((resolve) => server.listen(0, () => resolve(server)));
}

test('end-to-end generic download: save, clipboard, traversal-safety, dedup, errors', async (t) => {
  docsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dl-docs-'));
  const dlDir = path.join(docsDir, 'Teams-Downloads');
  const server = await startServer();
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  const session = makeSession();
  t.after(() => { server.close(); fs.rmSync(docsDir, { recursive: true, force: true }); });

  notifications.length = 0; clipboardCalls.length = 0;
  await dl.copyAttachmentAsFile(`${base}/binary`, session, '');
  assert.ok(fs.existsSync(path.join(dlDir, 'report.pdf')), 'report.pdf saved');
  assert.strictEqual(fs.readFileSync(path.join(dlDir, 'report.pdf'), 'utf8'), 'PDF-BYTES-1234');
  assert.ok(notifications.some((n) => /Downloaded & Copied/.test(n.title)), 'success toast');
  assert.ok(clipboardCalls.some((c) => c[0] === 'writeBuffer'), 'file placed on clipboard');

  await dl.copyAttachmentAsFile(`${base}/cdtraversal`, session, '');
  assert.ok(fs.existsSync(path.join(dlDir, 'escape.zip')), 'traversal filename neutralized');
  assert.ok(!fs.existsSync(path.join(docsDir, 'escape.zip')), 'file did not escape the dir');

  await dl.copyAttachmentAsFile(`${base}/noheader/myfile.bin`, session, '');
  assert.ok(fs.existsSync(path.join(dlDir, 'myfile.bin')), 'filename derived from URL');

  await dl.copyAttachmentAsFile(`${base}/binary`, session, '');
  assert.ok(fs.existsSync(path.join(dlDir, 'report (1).pdf')), 'second identical download deduplicated');

  notifications.length = 0;
  await dl.copyAttachmentAsFile(`${base}/404`, session, '');
  assert.ok(notifications.some((n) => /Download Error/.test(n.title)), 'HTTP error surfaces a toast, no crash');
});

// ---- saveRenderedDocument (capture the open document's rendered content) ----
function fakeFrame(url, len, capture, opts = {}) {
  return {
    executeJavaScript: async (code) => {
      if (opts.throws) throw new Error('cross-origin frame, not scriptable');
      // The capture script reads document.body.innerHTML/innerText; the probe
      // script reads location/length.
      if (code.includes('innerHTML')) return capture;
      return { url, len };
    },
  };
}

test('saveRenderedDocument: picks the Office viewer frame and writes formatted HTML', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  notifications.length = 0;

  const teamsFrame = fakeFrame('https://teams.microsoft.com/x', 80, null);
  const officeFrame = fakeFrame(
    'https://contoso.sharepoint.com/:w:/r/sites/x/Doc.docx',
    500,
    { html: '<p>Hello <b>world</b></p>', text: 'Hello world', title: 'Doc - SharePoint' },
  );
  const deadFrame = fakeFrame('https://blocked.example.com', 9999, null, { throws: true });
  const webContents = { mainFrame: { framesInSubtree: [teamsFrame, officeFrame, deadFrame] } };

  const out = path.join(dir, 'doc.html');
  const res = await dl.saveRenderedDocument(webContents, out);

  assert.strictEqual(res.chars, 'Hello world'.length);
  assert.match(res.frameHost, /sharepoint\.com/);
  const html = fs.readFileSync(out, 'utf8');
  assert.match(html, /<!DOCTYPE html>/);
  assert.match(html, /<p>Hello <b>world<\/b><\/p>/, 'keeps rendered formatting');
  assert.ok(notifications.some((n) => /Document saved/.test(n.title)), 'shows a saved notification');
});

test('saveRenderedDocument: .txt destination writes plain text only', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const frame = fakeFrame('https://contoso.sharepoint.com/d', 300, {
    html: '<p>rich</p>', text: 'plain text body', title: 'D',
  });
  const out = path.join(dir, 'doc.txt');
  await dl.saveRenderedDocument({ mainFrame: { framesInSubtree: [frame] } }, out);

  assert.strictEqual(fs.readFileSync(out, 'utf8'), 'plain text body');
});

test('saveRenderedDocument: throws when no frame renders content', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const empty = fakeFrame('https://x', 0, null);
  const dead = fakeFrame('https://y', 5, null, { throws: true });
  await assert.rejects(
    () => dl.saveRenderedDocument({ mainFrame: { framesInSubtree: [empty, dead] } }, path.join(dir, 'never.html')),
    /No rendered document content/,
  );
});

test('end-to-end: destinationPath saves to the chosen path verbatim', async (t) => {
  docsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dl-docs-'));
  const server = await startServer();
  const { port } = server.address();
  const session = makeSession();
  const chosen = path.join(docsDir, 'custom', 'my-name.pdf');
  t.after(() => { server.close(); fs.rmSync(docsDir, { recursive: true, force: true }); });

  await dl.copyAttachmentAsFile(`http://127.0.0.1:${port}/binary`, session, '', { destinationPath: chosen });
  assert.ok(fs.existsSync(chosen), 'saved to the exact chosen path (dirs created)');
  assert.strictEqual(fs.readFileSync(chosen, 'utf8'), 'PDF-BYTES-1234');
  assert.ok(!fs.existsSync(path.join(docsDir, 'Teams-Downloads', 'report.pdf')), 'did not also save to default dir');
});
