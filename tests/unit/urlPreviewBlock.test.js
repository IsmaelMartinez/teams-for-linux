'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');
const { isUrlPreviewRequest, blockUrlPreviews } = require('../../app/mainAppWindow/urlPreviewBlock');

// app/mainAppWindow/index.js requires the electron runtime, so the handler is
// extracted from source and run against stubs.
const source = readFileSync(join(__dirname, '..', '..', 'app', 'mainAppWindow', 'index.js'), 'utf8');
const handlerSource = source.match(/function onBeforeRequestHandler\(details, callback\) \{[\s\S]*?\n\}/)?.[0];

function loadHandler(disableUrlPreviews) {
	return vm.runInNewContext(`${handlerSource}\nonBeforeRequestHandler`, {
		config: { platform: { disableUrlPreviews } },
		isUrlPreviewRequest,
		isMicrosoftTelemetryHost: () => false,
		customBackgroundService: { beforeRequestHandlerRedirectUrl: () => null },
		aboutBlankRequestCount: 0,
	});
}

function fakeSession() {
	const ses = { listener: null, filter: null };
	ses.webRequest = { onBeforeRequest: (filter, listener) => Object.assign(ses, { filter, listener }) };
	return ses;
}

const PREVIEW = 'https://no-prod.asyncgw.teams.microsoft.com/urlp/v1/url/richInfo?url=https%3A%2F%2Fgitlab.com%2Fa';

function respond(handler, url) {
	let response;
	handler({ url }, (r) => { response = r; });
	return response;
}

describe('URL preview blocking', () => {
	it('matches the richInfo lookup on any asyncgw region host only', () => {
		assert.strictEqual(isUrlPreviewRequest(PREVIEW), true);
		assert.strictEqual(isUrlPreviewRequest(PREVIEW.replace('no-prod', 'emea')), true);
		assert.strictEqual(isUrlPreviewRequest(PREVIEW.replace('teams.microsoft.com', 'teams.microsoft.com.evil.example')), false);
		assert.strictEqual(isUrlPreviewRequest('https://evil.example/urlp/v1/url/richInfo'), false);
		assert.strictEqual(isUrlPreviewRequest('https://no-prod.asyncgw.teams.microsoft.com/urlp/v1/url/Thumbnail?url=x'), false);
		assert.strictEqual(isUrlPreviewRequest(undefined), false);
	});

	it('root window handler cancels the lookup only when disableUrlPreviews is on', () => {
		assert.strictEqual(respond(loadHandler(true), PREVIEW).cancel, true);
		assert.strictEqual(respond(loadHandler(false), PREVIEW).cancel, undefined);
		assert.strictEqual(respond(loadHandler(true), 'https://teams.cloud.microsoft/').cancel, undefined);
	});

	it('profile sessions get a listener only when disableUrlPreviews is on', () => {
		const off = fakeSession();
		blockUrlPreviews(off, { platform: { disableUrlPreviews: false } });
		blockUrlPreviews(off, {});
		assert.strictEqual(off.listener, null);

		const on = fakeSession();
		blockUrlPreviews(on, { platform: { disableUrlPreviews: true } });
		assert.deepStrictEqual(on.filter, { urls: ['https://*.asyncgw.teams.microsoft.com/*'] });
		assert.strictEqual(respond(on.listener, PREVIEW).cancel, true);
		assert.strictEqual(respond(on.listener, 'https://no-prod.asyncgw.teams.microsoft.com/urlp/v1/url/Thumbnail?url=x').cancel, false);
	});
});
