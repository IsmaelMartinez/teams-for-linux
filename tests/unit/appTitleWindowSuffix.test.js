'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

// Regression guard for #3035: a custom app.title suffixes the window title,
// while the default leaves Electron mirroring document.title. Source-text
// assertion because app/mainAppWindow/index.js requires the electron runtime.

const INDEX_PATH = join(__dirname, '..', '..', 'app', 'mainAppWindow', 'index.js');

describe('onPageTitleUpdated app.title suffix', () => {
	const source = readFileSync(INDEX_PATH, 'utf8');
	const handler = source.match(/function onPageTitleUpdated\(event, title\) \{[\s\S]*?\n\}/)?.[0];

	it('exists with the event parameter it needs to preventDefault', () => {
		assert.ok(handler, 'onPageTitleUpdated(event, title) not found');
	});

	it('only overrides the title when app.title differs from the default', () => {
		assert.match(handler, /config\.appTitle\s*!==\s*"Microsoft Teams"/);
	});

	it('prevents the native update and applies exactly one suffix inside that branch', () => {
		const branch = handler.match(/if \([^)]*"Microsoft Teams"\) \{([\s\S]*?)\n {2}\}/)?.[1] ?? '';
		assert.match(branch, /event\.preventDefault\(\)/);
		assert.match(branch, /window\.setTitle\(`\$\{title\} - \$\{config\.appTitle\}`\)/);
	});

	it('does not preventDefault outside the custom-title branch', () => {
		assert.strictEqual(handler.match(/preventDefault\(\)/g)?.length, 1);
	});

	it('still forwards the raw page title to the renderer', () => {
		assert.match(handler, /webContents\.send\("page-title", title\)/);
	});
});
