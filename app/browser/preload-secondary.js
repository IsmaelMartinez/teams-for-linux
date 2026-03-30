'use strict';

// Outlook registers a capture-phase contextmenu listener that calls
// stopImmediatePropagation() + preventDefault(), silencing Electron's
// webContents context-menu event for all elements.
//
// We selectively intercept only editable targets (contenteditable, input,
// textarea) where Outlook suppresses the browser menu without showing its own.
// For links and other elements Outlook's handler is allowed to run so its
// custom context menus continue to work.
//
// Preload runs before page scripts, so this listener is always registered first.
// Not calling preventDefault leaves defaultPrevented=false so Chromium sends
// ShowContextMenu to the main process, firing Electron's context-menu event.
window.addEventListener('contextmenu', (e) => {
  const t = e.target;
  if (t.isContentEditable || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') {
    e.stopImmediatePropagation();
  }
}, true);
