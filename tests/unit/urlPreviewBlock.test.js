'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');

// app/mainAppWindow/index.js requires the electron runtime, so the handler is
// extracted from source and run against stubs.
const source = readFileSync(join(__dirname, '..', '..', 'app', 'mainAppWindow', 'index.js'), 'utf8');
const extract = (signature) =>
	source.match(new RegExp(`function ${signature} \\{[\\s\\S]*?\\n\\}`))?.[0];

function load(disableUrlPreviews) {
	return vm.runInNewContext(
		`${extract('isUrlPreviewRequest\\(url\\)')}\n${extract('onBeforeRequestHandler\\(details, callback\\)')}\n({ isUrlPreviewRequest, onBeforeRequestHandler })`,
		{
			URL,
			config: { platform: { disableUrlPreviews } },
			isMicrosoftTelemetryHost: () => false,
			customBackgroundService: { beforeRequestHandlerRedirectUrl: () => null },
			aboutBlankRequestCount: 0,
		}
	);
}

const PREVIEW = 'https://no-prod.asyncgw.teams.microsoft.com/urlp/v1/url/richInfo?url=https%3A%2F%2Fgitlab.com%2Fa';

function respond(handler, url) {
	let response;
	handler({ url }, (r) => { response = r; });
	return response;
}

describe('URL preview blocking', () => {
	it('matches the richInfo lookup on any asyncgw region host only', () => {
		const { isUrlPreviewRequest } = load(true);
		assert.strictEqual(isUrlPreviewRequest(PREVIEW), true);
		assert.strictEqual(isUrlPreviewRequest(PREVIEW.replace('no-prod', 'emea')), true);
		assert.strictEqual(isUrlPreviewRequest(PREVIEW.replace('teams.microsoft.com', 'teams.microsoft.com.evil.example')), false);
		assert.strictEqual(isUrlPreviewRequest('https://evil.example/urlp/v1/url/richInfo'), false);
		assert.strictEqual(isUrlPreviewRequest('https://no-prod.asyncgw.teams.microsoft.com/urlp/v1/url/Thumbnail?url=x'), false);
		assert.strictEqual(isUrlPreviewRequest(undefined), false);
	});

	it('cancels the lookup only when disableUrlPreviews is on', () => {
		assert.strictEqual(respond(load(true).onBeforeRequestHandler, PREVIEW).cancel, true);
		assert.strictEqual(respond(load(false).onBeforeRequestHandler, PREVIEW).cancel, undefined);
		assert.strictEqual(respond(load(true).onBeforeRequestHandler, 'https://teams.cloud.microsoft/').cancel, undefined);
	});
});
