'use strict';

// Electron main script for custom-toast-layout.spec.js. Creates one hidden
// custom toast per case from TOAST_CASES (JSON: [{ id, options }]) through the
// real NotificationToast class, so the spec can inspect the rendered layout.
// All windows are created up front: destroying and reloading windows in a
// loop produces spurious ERR_FAILED (see AGENTS.md).

const { app } = require('electron');
const path = require('node:path');

const root = path.join(__dirname, '../../..');
const NotificationToast = require(path.join(root, 'app/notificationSystem/NotificationToast'));
const { resolveToastOptions } = require(path.join(root, 'app/notificationSystem/toastOptions'));

const LONG_BODY = 'This message is long enough to need many lines in the toast. '.repeat(12);

// Held for the life of the process so the toasts aren't garbage-collected
// while the spec measures them.
const toasts = [];

app.whenReady().then(() => {
  const cases = JSON.parse(process.env.TOAST_CASES || '[]');
  for (const { id, options } of cases) {
    // Never shown: the layout is computed for hidden windows too.
    toasts.push(new NotificationToast({ title: id, body: LONG_BODY }, resolveToastOptions(options)));
  }
});
