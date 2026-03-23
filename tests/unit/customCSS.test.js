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
		assert.match(injectedRule, /\[data-tid='more-options-menu-premium-button']/);
		assert.match(injectedRule, /\[data-tid='more-options-header'] > div:first-child/);
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
			assert.match(injectedRules[0], /\[data-tid='more-options-menu-premium-button']/);
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
});
