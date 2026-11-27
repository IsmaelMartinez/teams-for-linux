import { test, expect } from '@playwright/test';
import {
  startApp,
  findMainTeamsWindow,
  waitForLoginRedirect,
  getRegisteredHandlers,
  getEventHandlerCounts,
  getContentViewChildBounds,
  invokeHandler,
  APP_PAGE_URL,
  closeAndCleanup,
  PROFILE_IPC_CHANNELS,
  SWITCHER_EVENT_CHANNELS,
  SWITCHER_HANDLE_CHANNELS,
  SWITCHER_PILL_SIZE,
} from './helpers/electronApp.js';

// Phase 1c.1 regression test for the flag-on path: with no profiles yet
// configured, the app must reach Microsoft login the same way it does
// with the flag off. This catches the case where ProfileViewManager
// initialization or the bootstrap check breaks the startup sequence.
test('multi-account enabled, no profiles yet = same redirect to Microsoft login', async () => {
  const ctx = await startApp({
    prefix: 'teams-e2e-enabled-',
    config: { multiAccount: { enabled: true } },
    // Need `electronApp.evaluate` to introspect ipcMain._invokeHandlers
    // and to call the profile-list handler directly.
    allowEval: true,
  });

  try {
    expect(ctx.electronApp.windows().length).toBeGreaterThan(0);

    const mainWindow = findMainTeamsWindow(ctx.electronApp);
    expect(mainWindow).toBeTruthy();
    await waitForLoginRedirect(mainWindow);

    // With the flag on, all six profile-* handlers should be registered.
    const registered = await getRegisteredHandlers(
      ctx.electronApp,
      PROFILE_IPC_CHANNELS
    );
    expect(registered).not.toHaveProperty('error');
    for (const channel of PROFILE_IPC_CHANNELS) {
      expect(
        registered[channel],
        `expected ${channel} handler to be present when multiAccount.enabled is true`
      ).toBe(true);
    }

    // With no prior cookies on persist:teams-4-linux, the bootstrap
    // heuristic should skip — `app.profiles` stays empty.
    const profiles = await invokeHandler(ctx.electronApp, 'profile-list');
    expect(profiles).toHaveProperty('result');
    expect(profiles.result).toEqual([]);

    // Phase 1c.2: the switcher pill is created when the flag is on. Its
    // open-add / open-manage listeners and the set-expanded invoke handler
    // should all be registered.
    const eventCounts = await getEventHandlerCounts(
      ctx.electronApp,
      SWITCHER_EVENT_CHANNELS
    );
    for (const channel of SWITCHER_EVENT_CHANNELS) {
      expect(
        eventCounts[channel],
        `expected ${channel} listener to be present when multiAccount.enabled is true`
      ).toBeGreaterThan(0);
    }
    const switcherHandlers = await getRegisteredHandlers(
      ctx.electronApp,
      SWITCHER_HANDLE_CHANNELS
    );
    for (const channel of SWITCHER_HANDLE_CHANNELS) {
      expect(switcherHandlers[channel], `expected ${channel} handler`).toBe(
        true
      );
    }

    // With no profiles yet, the only contentView child is the switcher pill,
    // a small square flush to the window's bottom-left corner, and it actually
    // loaded the switcher renderer.
    const view = await getContentViewChildBounds(ctx.electronApp);
    expect(view).not.toHaveProperty('error');
    expect(view.count).toBe(1);
    const pill = view.bounds[0];
    expect(pill.x).toBe(0);
    expect(pill.width).toBe(SWITCHER_PILL_SIZE);
    expect(pill.height).toBe(SWITCHER_PILL_SIZE);
    expect(pill.y).toBe(view.contentHeight - SWITCHER_PILL_SIZE);
    expect(view.urls[0]).toMatch(/profileSwitcher\/switcher\.html$/);
  } finally {
    await closeAndCleanup(ctx);
  }
});

// Phase 1c.2 shortcuts: pinning is capped at 5 (the Ctrl+Alt+1…5 slots) and
// pinned profiles get menu accelerators in Profiles → Switch to, slotted by
// list order. Unpinned profiles get no accelerator.
test('pinning caps at 5 and maps Ctrl+Alt accelerators onto pinned profiles', async () => {
  const ctx = await startApp({
    prefix: 'teams-e2e-pin-',
    config: { multiAccount: { enabled: true } },
    allowEval: true,
  });

  try {
    const mainWindow = findMainTeamsWindow(ctx.electronApp);
    expect(mainWindow).toBeTruthy();
    await waitForLoginRedirect(mainWindow);

    // Create six profiles; pin the first five.
    const ids = [];
    for (let i = 1; i <= 6; i++) {
      const added = await invokeHandler(ctx.electronApp, 'profile-add', [
        { name: `Profile ${i}` },
      ]);
      expect(added).toHaveProperty('result');
      ids.push(added.result.id);
    }
    for (let i = 0; i < 5; i++) {
      const pinned = await invokeHandler(ctx.electronApp, 'profile-update', [
        ids[i],
        { pinned: true },
      ]);
      expect(pinned).toHaveProperty('result');
      expect(pinned.result.pinned).toBe(true);
    }

    // The sixth pin must be rejected by the main-side cap. (The accelerator
    // slot mapping itself is covered by tests/unit/profilesMenu.test.js —
    // the menu here is set per-window via window.setMenu, which
    // Menu.getApplicationMenu cannot introspect on Linux.)
    const sixth = await ctx.electronApp.evaluate(
      ({ ipcMain }, { id, senderUrl }) => {
        const handler = ipcMain._invokeHandlers?.get?.('profile-update');
        if (!handler) return { error: 'profile-update handler missing' };
        return Promise.resolve(
          handler({ senderFrame: { url: senderUrl } }, id, { pinned: true })
        )
          .then((result) => ({ result }))
          .catch((error) => ({ rejected: error.message }));
      },
      { id: ids[5], senderUrl: APP_PAGE_URL }
    );
    expect(sixth).toHaveProperty('rejected');
    expect(sixth.rejected).toMatch(/at most 5/i);

    // Unpinning one frees a slot — pinning the sixth then succeeds.
    const unpin = await invokeHandler(ctx.electronApp, 'profile-update', [
      ids[0],
      { pinned: false },
    ]);
    expect(unpin.result.pinned).toBe(false);
    const repin = await invokeHandler(ctx.electronApp, 'profile-update', [
      ids[5],
      { pinned: true },
    ]);
    expect(repin.result.pinned).toBe(true);
  } finally {
    await closeAndCleanup(ctx);
  }
});

// Two profiles through the real ProfilesManager → ProfileViewManager event
// path, switched to the second (mirrors the Add dialog, which adds then
// switches). Leaves the window as [A (hidden), B (active), pill].
async function startWithTwoProfiles(prefix) {
  const ctx = await startApp({
    prefix,
    config: { multiAccount: { enabled: true } },
    allowEval: true,
  });
  // Callers enter their try/finally only after this returns, so a setup
  // failure must clean up here or the app and its temp dir leak.
  try {
    const mainWindow = findMainTeamsWindow(ctx.electronApp);
    expect(mainWindow).toBeTruthy();
    await waitForLoginRedirect(mainWindow);
    const a = await invokeHandler(ctx.electronApp, 'profile-add', [
      { name: 'Profile A' },
    ]);
    const b = await invokeHandler(ctx.electronApp, 'profile-add', [
      { name: 'Profile B' },
    ]);
    expect(a).toHaveProperty('result');
    expect(b).toHaveProperty('result');
    const switched = await invokeHandler(ctx.electronApp, 'profile-switch', [
      b.result.id,
    ]);
    expect(switched).toHaveProperty('result');
    return { ctx, a, b };
  } catch (error) {
    await closeAndCleanup(ctx);
    throw error;
  }
}

// Phase 1c.2: switching to a profile view must fill the content area and keep
// the switcher pill topmost (the #raiseChrome re-assert after addChildView).
test('switching to a profile view fills the window and keeps the pill topmost', async () => {
  const { ctx } = await startWithTwoProfiles('teams-e2e-switch-');

  try {
    const view = await getContentViewChildBounds(ctx.electronApp);
    expect(view).not.toHaveProperty('error');
    // Both profile views stay attached (#3057) with the pill on top; only
    // the active one, raised just below the pill, is visible.
    expect(view.count).toBe(3);
    expect(view.visible).toEqual([false, true, true]);

    // The pill is the LAST (topmost) child, still in the bottom-left corner.
    const pill = view.bounds[view.count - 1];
    expect(pill.x).toBe(0);
    expect(pill.width).toBe(SWITCHER_PILL_SIZE);
    expect(pill.height).toBe(SWITCHER_PILL_SIZE);
    expect(pill.y).toBe(view.contentHeight - SWITCHER_PILL_SIZE);
    expect(view.urls[view.count - 1]).toMatch(
      /profileSwitcher\/switcher\.html$/
    );

    // The active profile view fills the whole content area (no inset).
    const profileView = view.bounds[view.count - 2];
    expect(profileView.x).toBe(0);
    expect(profileView.y).toBe(0);
    expect(profileView.width).toBe(view.contentWidth);
    expect(profileView.height).toBe(view.contentHeight);
  } finally {
    await closeAndCleanup(ctx);
  }
});

// Phase 2: unread in a background profile reaches the switcher pill through
// the real pipeline — set-badge-count from that profile's view → aggregator →
// ProfileViewManager → profile-switcher-unread → pill DOM.
function setBackgroundBadge(electronApp, count) {
  return electronApp.evaluate(async ({ BrowserWindow, ipcMain }, count) => {
    const win = BrowserWindow.getAllWindows().find(
      (w) => w.contentView.children.length === 3
    );
    const background = win?.contentView.children.find((c) => !c.getVisible());
    const handler = ipcMain._invokeHandlers?.get?.('set-badge-count');
    if (!background || !handler) return { error: 'missing view or handler' };
    await handler({ sender: background.webContents }, count);
    return { ok: true };
  }, count);
}

function readPill(electronApp) {
  return electronApp.evaluate(async ({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows().find(
      (w) => w.contentView.children.length === 3
    );
    const pill = win.contentView.children.at(-1);
    return pill.webContents.executeJavaScript(`(() => {
      renderList();
      return {
        dotHidden: document.getElementById('pill-unread').hidden,
        badges: [...document.querySelectorAll('.profile-row')].map((row) => ({
          name: row.querySelector('.name').textContent,
          badge: row.querySelector('.unread-badge')?.textContent ?? null,
        })),
      };
    })()`);
  });
}

test('unread in a background profile lights the pill dot and its row badge', async () => {
  const { ctx, a } = await startWithTwoProfiles('teams-e2e-unread-');

  try {
    expect(await setBackgroundBadge(ctx.electronApp, 3)).toEqual({ ok: true });
    await expect
      .poll(async () => (await readPill(ctx.electronApp)).dotHidden)
      .toBe(false);
    const lit = await readPill(ctx.electronApp);
    expect(lit.badges).toEqual([
      { name: a.result.name, badge: '3' },
      { name: 'Profile B', badge: null },
    ]);

    // Open the dropdown, focus a row, then let an unread push rebuild the
    // list: keyboard focus must stay on that profile's row.
    const inPill = (expr) =>
      ctx.electronApp.evaluate(async ({ BrowserWindow }, expr) => {
        const win = BrowserWindow.getAllWindows().find(
          (w) => w.contentView.children.length === 3
        );
        return win.contentView.children.at(-1).webContents.executeJavaScript(expr);
      }, expr);
    expect(
      await inPill(`(async () => {
        document.getElementById('pill').click();
        for (let i = 0; i < 100 && document.getElementById('dropdown').hidden; i++) {
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
        document.querySelector('li:last-child .profile-row').focus();
        return document.activeElement.querySelector('.name')?.textContent ?? null;
      })()`)
    ).toBe('Profile B');
    expect(await setBackgroundBadge(ctx.electronApp, 7)).toEqual({ ok: true });
    await expect
      .poll(() =>
        inPill(`document.querySelector('li:first-child .unread-badge')?.textContent ?? null`)
      )
      .toBe('7');
    expect(
      await inPill(`document.activeElement.classList.contains('profile-row')
        ? document.activeElement.querySelector('.name').textContent
        : null`)
    ).toBe('Profile B');
    await inPill(`document.getElementById('scrim').click()`);

    // Reading the background profile clears both.
    expect(await setBackgroundBadge(ctx.electronApp, 0)).toEqual({ ok: true });
    await expect
      .poll(async () => (await readPill(ctx.electronApp)).dotHidden)
      .toBe(true);
  } finally {
    await closeAndCleanup(ctx);
  }
});

// Phase 2: per-profile notification flags are enforced inside each profile's
// own renderer — pulled on load, pushed on update — by the preload's
// Notification override and sound request.
function profileViewIds(electronApp) {
  return electronApp.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows().find(
      (w) => w.contentView.children.length > 0
    );
    return win.contentView.children
      .map((c) => c.webContents)
      .filter((wc) => wc && !wc.getURL().includes('profileSwitcher'))
      .map((wc) => wc.id);
  });
}

// Creates a notification in the given renderer and reports what the page got
// back and how many sound requests reached main.
function notifyIn(electronApp, webContentsId) {
  return electronApp.evaluate(async ({ webContents }, id) => {
    const wc = webContents.fromId(id);
    const before = globalThis.__soundCalls;
    const page = await wc.executeJavaScript(`(() => {
      const n = new Notification('Hello', { body: 'from e2e' });
      return {
        kind: Object.prototype.toString.call(n),
        silent: n.silent === true,
        // Teams drives every notification's lifecycle; an object without
        // these breaks its notifier for the rest of the session.
        lifecycle: typeof n.close === 'function' && typeof n.addEventListener === 'function',
      };
    })()`);
    await new Promise((resolve) => setTimeout(resolve, 200));
    return { ...page, sounds: globalThis.__soundCalls - before };
  }, webContentsId);
}

test('per-profile notification flags are enforced in that profile renderer', async () => {
  const ctx = await startApp({
    prefix: 'teams-e2e-notify-',
    config: { multiAccount: { enabled: true } },
    allowEval: true,
  });

  try {
    await waitForLoginRedirect(findMainTeamsWindow(ctx.electronApp));
    // Count sound requests instead of playing them.
    await ctx.electronApp.evaluate(({ ipcMain }) => {
      globalThis.__soundCalls = 0;
      ipcMain.removeHandler('play-notification-sound');
      ipcMain.handle('play-notification-sound', () => {
        globalThis.__soundCalls += 1;
      });
    });

    const a = await invokeHandler(ctx.electronApp, 'profile-add', [
      { name: 'Loud' },
    ]);
    const [viewA] = await profileViewIds(ctx.electronApp);
    await expect
      .poll(async () => (await notifyIn(ctx.electronApp, viewA)).kind, { timeout: 15000 })
      .toBe('[object Notification]');
    expect(await notifyIn(ctx.electronApp, viewA)).toEqual({
      kind: '[object Notification]',
      silent: false,
      lifecycle: true,
      sounds: 1,
    });

    // Push: muting the live profile silences its next toast.
    await invokeHandler(ctx.electronApp, 'profile-update', [
      a.result.id,
      { muted: true },
    ]);
    await expect
      .poll(async () => (await notifyIn(ctx.electronApp, viewA)).silent)
      .toBe(true);
    expect((await notifyIn(ctx.electronApp, viewA)).sounds).toBe(0);

    // Teams may reuse its options object, so the mute must never be written
    // into it — or it would outlive the mute. One call, so a navigation of
    // the page can't hide a regression.
    const callerObject = await ctx.electronApp.evaluate(
      async ({ webContents }, id) =>
        webContents.fromId(id).executeJavaScript(`(() => {
          const opts = { body: 'reused' };
          const n = new Notification('Again', opts);
          return { toastSilent: n.silent === true, written: 'silent' in opts };
        })()`),
      viewA
    );
    expect(callerObject).toEqual({ toastSilent: true, written: false });

    // Pull: a profile created with notifications off never shows a toast.
    await invokeHandler(ctx.electronApp, 'profile-add', [
      { name: 'Quiet', disableNotifications: true },
    ]);
    const viewB = (await profileViewIds(ctx.electronApp)).find((id) => id !== viewA);
    await expect
      .poll(async () => (await notifyIn(ctx.electronApp, viewB)).kind, { timeout: 15000 })
      .toBe('[object Object]');
    const quiet = await notifyIn(ctx.electronApp, viewB);
    expect(quiet.lifecycle).toBe(true);
    expect(quiet.sounds).toBe(0);
  } finally {
    await closeAndCleanup(ctx);
  }
});

// Manage dialog: toggling a flag mid-rename rebuilds the list. The typed name
// must not be lost: removing the focused input blurs it, which commits it.
test('toggling a notification switch mid-rename keeps the typed name', async () => {
  const ctx = await startApp({
    prefix: 'teams-e2e-draft-',
    config: { multiAccount: { enabled: true } },
    allowEval: true,
  });

  try {
    await waitForLoginRedirect(findMainTeamsWindow(ctx.electronApp));
    await invokeHandler(ctx.electronApp, 'profile-add', [{ name: 'Work' }]);
    const draft = await ctx.electronApp.evaluate(async ({ BrowserWindow }) => {
      const main = BrowserWindow.getAllWindows().find((w) => w.contentView.children.length > 0);
      const pill = main.contentView.children
        .map((c) => c.webContents)
        .find((wc) => wc.getURL().includes('profileSwitcher'));
      const before = new Set(BrowserWindow.getAllWindows().map((w) => w.id));
      await pill.executeJavaScript('globalThis.profileSwitcherApi.openManageDialog()');
      let dialog;
      for (let i = 0; i < 100 && !dialog; i++) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        dialog = BrowserWindow.getAllWindows().find((w) => !before.has(w.id));
      }
      if (!dialog) return { error: 'no dialog' };
      const page = (js) => dialog.webContents.executeJavaScript(js);
      for (let i = 0; i < 100; i++) {
        if (await page(`!!document.querySelector('.profile-name')`)) break;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      await page(`(() => {
        document.querySelector('.profile-name').click();
        const input = document.querySelector('.profile-name-input');
        input.value = 'Work (renamed)';
        input.dispatchEvent(new Event('input'));
        document.querySelector('.profile-flag input').click();
      })()`);
      // Wait for the update's state push to rebuild the list.
      for (let i = 0; i < 100; i++) {
        if (await page(`!document.querySelector('.profile-flag input').checked`)) break;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
      return page(`document.querySelector('.profile-name-input')?.value ??
        document.querySelector('.profile-name')?.textContent ?? null`);
    });
    expect(draft).toBe('Work (renamed)');
  } finally {
    await closeAndCleanup(ctx);
  }
});

// Phase 2: a click on a toast brings forward the profile that raised it. The
// OS toast itself can't be clicked from a test, so this drives the two halves
// of the `web` path: a reported click switches to the raising profile, and a
// synthetic click dispatched by page script is ignored.
test('a notification click switches to the profile that raised it', async () => {
  const { ctx, a } = await startWithTwoProfiles('teams-e2e-toast-click-');

  try {
    const activeId = async () =>
      (await invokeHandler(ctx.electronApp, 'profile-get-active', [])).result?.id;
    const inBackground = (js) =>
      ctx.electronApp.evaluate(async ({ BrowserWindow }, js) => {
        const win = BrowserWindow.getAllWindows().find(
          (w) => w.contentView.children.length === 3
        );
        const background = win.contentView.children.find((c) => !c.getVisible());
        return background.webContents.executeJavaScript(js);
      }, js);
    const notAProfileA = await activeId();
    expect(notAProfileA).not.toBe(a.result.id);

    // Page script dispatching a click must not steal the window.
    await expect
      .poll(() =>
        inBackground(`(() => {
          const n = new Notification('Hi', { body: 'x' });
          n.dispatchEvent(new Event('click'));
          return Object.prototype.toString.call(n);
        })()`)
      , { timeout: 15000 })
      .toBe('[object Notification]');
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(await activeId()).toBe(notAProfileA);

    // A page that patches addEventListener can't capture the preload's
    // listener and call it with a forged trusted event.
    const stolen = await inBackground(`(() => {
      const recorded = [];
      const original = EventTarget.prototype.addEventListener;
      EventTarget.prototype.addEventListener = function (type, fn, ...rest) {
        if (type === 'click') recorded.push(fn);
        return original.call(this, type, fn, ...rest);
      };
      try {
        new Notification('Hi', { body: 'y' });
        for (const fn of recorded) fn({ isTrusted: true });
        return recorded.length;
      } finally {
        EventTarget.prototype.addEventListener = original;
      }
    })()`);
    expect(stolen).toBe(0);
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(await activeId()).toBe(notAProfileA);

    // A user click, as the preload reports it, switches to profile A.
    await ctx.electronApp.evaluate(({ BrowserWindow, ipcMain }) => {
      const win = BrowserWindow.getAllWindows().find(
        (w) => w.contentView.children.length === 3
      );
      const background = win.contentView.children.find((c) => !c.getVisible());
      ipcMain.emit('notification-web-clicked', { sender: background.webContents });
    });
    await expect.poll(activeId).toBe(a.result.id);
  } finally {
    await closeAndCleanup(ctx);
  }
});

// A link from outside the app (a second instance: the msteams: handler or a
// browser redirector) opens in the ACTIVE profile's view, not on the root
// window behind it (Profile 0).
test('a second-instance link navigates the active profile view, not the root window', async () => {
  const { ctx } = await startWithTwoProfiles('teams-e2e-deeplink-');

  try {
    const link = 'https://teams.microsoft.com/l/chat/0/0?users=e2e@example.invalid';
    // Record every main-frame navigation start per surface, then emit the
    // event Electron raises when a second copy of the app is launched.
    const result = await ctx.electronApp.evaluate(async ({ app, BrowserWindow }, link) => {
      const win = BrowserWindow.getAllWindows().find(
        (w) => w.contentView.children.length === 3
      );
      const active = win.contentView.children.find((c) => c.getVisible() && c !== win.contentView.children.at(-1));
      const surfaces = {
        root: win.webContents,
        active: active.webContents,
        background: win.contentView.children[0].webContents,
      };
      const started = { root: [], active: [], background: [] };
      for (const [name, wc] of Object.entries(surfaces)) {
        wc.on('did-start-navigation', (details) => {
          if (details.isMainFrame) started[name].push(details.url);
        });
      }
      globalThis.__deepLinkStarted = started;
      app.emit('second-instance', { preventDefault() {} }, ['teams-for-linux', link], process.cwd());
      return { activeIsBackground: surfaces.active === surfaces.background };
    }, link);
    expect(result.activeIsBackground).toBe(false);

    await expect
      .poll(
        () => ctx.electronApp.evaluate(() => globalThis.__deepLinkStarted.active),
        { timeout: 15000 }
      )
      .toContain(link);
    const started = await ctx.electronApp.evaluate(() => globalThis.__deepLinkStarted);
    expect(started.root.filter((url) => url.includes('/l/chat/'))).toEqual([]);
    expect(started.background.filter((url) => url.includes('/l/chat/'))).toEqual([]);
  } finally {
    await closeAndCleanup(ctx);
  }
});
