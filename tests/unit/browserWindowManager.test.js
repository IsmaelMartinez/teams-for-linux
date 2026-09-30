'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');

const electronPath = require.resolve('electron');
const managerPath = require.resolve('../../app/mainAppWindow/browserWindowManager');

let createdOptions;
let BrowserWindowManager;

before(() => {
	class MockBrowserWindow {
		constructor(options) {
			createdOptions = options;
		}
	}
	require.cache[electronPath] = {
		id: electronPath,
		filename: electronPath,
		loaded: true,
		exports: {
			app: {},
			BrowserWindow: MockBrowserWindow,
			ipcMain: {},
			nativeImage: {},
			nativeTheme: { shouldUseDarkColors: false },
			powerSaveBlocker: {},
			session: {},
			WebContentsView: class {},
		},
	};
	delete require.cache[managerPath];
	BrowserWindowManager = require(managerPath);
});

after(() => {
	delete require.cache[electronPath];
	delete require.cache[managerPath];
});

describe('BrowserWindowManager.createNewBrowserWindow', () => {
	it('sets a minimum size so a tiny restored size cannot stick (#2996)', () => {
		const manager = new BrowserWindowManager({ config: { menubar: 'auto', partition: 'persist:teams-4-linux' } });
		manager.createNewBrowserWindow({ x: 0, y: 0, width: 1, height: 1 });

		assert.strictEqual(createdOptions.width, 1);
		assert.strictEqual(createdOptions.height, 1);
		assert.ok(createdOptions.minWidth >= 400, `minWidth was ${createdOptions.minWidth}`);
		assert.ok(createdOptions.minHeight >= 300, `minHeight was ${createdOptions.minHeight}`);
	});
});
