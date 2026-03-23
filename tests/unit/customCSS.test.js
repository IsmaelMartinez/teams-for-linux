'use strict';

const { describe, it, mock } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const customCSS = require('../../app/customCSS');

describe('customCSS default injected rules', () => {
	it('hides premium UI while preserving more-options button', () => {
		const content = { insertCSS: mock.fn() };

		customCSS.onDidFinishLoad(content, {});

		assert.strictEqual(content.insertCSS.mock.calls.length, 2);
		const injectedRule = content.insertCSS.mock.calls[0].arguments[0];
		assert.match(injectedRule, /\[data-tid\^='more-options-menu-premium-button']/);
		assert.match(injectedRule, /\[data-tid='more-options-header'] > div:first-child/);
		assert.match(injectedRule, /\[data-tid='more-options-header'] > span:not\(\.fui-Button__icon\)/);
		assert.doesNotMatch(injectedRule, /\[data-tid='more-options-header']\s*\{/);
	});

	it('loads custom CSS when customCSSLocation is provided', async () => {
		const content = { insertCSS: mock.fn() };
		const customCssLocation = path.join(os.tmpdir(), 'mock-custom-css.css');
		let readFileCalledWith = null;
		let resolveReadFile;
		const readFileDone = new Promise((resolve) => {
			resolveReadFile = resolve;
		});
		const readFileMock = mock.method(fs, 'readFile', (filePath, encoding, callback) => {
			readFileCalledWith = { filePath, encoding };
			queueMicrotask(() => {
				callback(null, 'body { color: red; }');
				resolveReadFile();
			});
		});

		try {
			customCSS.onDidFinishLoad(content, { customCSSLocation: customCssLocation });
			await readFileDone;

			assert.strictEqual(content.insertCSS.mock.calls.length, 3);
			const injectedRules = content.insertCSS.mock.calls.map((call) => call.arguments[0]);
			assert.match(injectedRules[0], /\[data-tid\^='more-options-menu-premium-button']/);
			assert.match(injectedRules[1], /\.zoetrope/);
			assert.strictEqual(injectedRules[2], 'body { color: red; }');
			assert.deepStrictEqual(readFileCalledWith, {
				filePath: customCssLocation,
				encoding: 'utf-8',
			});
		} finally {
			readFileMock.mock.restore();
		}
	});

	it('injects default premium-hiding CSS into Teams V2 frame', () => {
		const webFrame = { executeJavaScript: mock.fn() };

		customCSS.onDidFrameFinishLoad(webFrame, {});

		assert.strictEqual(webFrame.executeJavaScript.mock.calls.length, 1);
		const script = webFrame.executeJavaScript.mock.calls[0].arguments[0];
		assert.match(script, /tfl-default-css-style/);
		assert.match(script, /more-options-menu-premium-button/);
		assert.match(script, /more-options-header/);
	});

	it('injects both custom and default CSS into Teams V2 frame when customCSSLocation is set', () => {
		const webFrame = { executeJavaScript: mock.fn() };
		const customCssLocation = path.join(os.tmpdir(), 'mock-frame-custom-css.css');
		const readFileMock = mock.method(fs, 'readFile', (_filePath, _encoding, callback) => {
			callback(null, '.from-custom-frame { color: red; }');
		});

		try {
			customCSS.onDidFrameFinishLoad(webFrame, { customCSSLocation: customCssLocation });

			assert.strictEqual(webFrame.executeJavaScript.mock.calls.length, 2);
			const scripts = webFrame.executeJavaScript.mock.calls.map((call) => call.arguments[0]);
			assert.match(scripts[0], /tfl-custom-css-style/);
			assert.match(scripts[0], /from-custom-frame/);
			assert.match(scripts[1], /tfl-default-css-style/);
			assert.match(scripts[1], /more-options-menu-premium-button/);
		} finally {
			readFileMock.mock.restore();
		}
	});
});
