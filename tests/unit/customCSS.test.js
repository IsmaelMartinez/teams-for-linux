'use strict';

const { describe, it, mock } = require('node:test');
const assert = require('node:assert');

const customCSS = require('../../app/customCSS');

describe('customCSS default injected rules', () => {
	it('hides premium UI while preserving more-options button', () => {
		const content = { insertCSS: mock.fn() };

		customCSS.onDidFinishLoad(content, {});

		assert.ok(content.insertCSS.mock.calls.length >= 1, 'should inject at least one CSS rule');
		const injectedRule = content.insertCSS.mock.calls[0].arguments[0];
		assert.match(injectedRule, /\[data-tid='more-options-menu-premium-button']/);
		assert.match(injectedRule, /\[data-tid='more-options-header'] > div:first-child/);
		assert.doesNotMatch(injectedRule, /\[data-tid='more-options-header']\s*\{/);
	});
});
