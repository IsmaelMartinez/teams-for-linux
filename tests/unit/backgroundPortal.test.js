const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert');

const backgroundPortal = require('../../app/backgroundPortal');

// The granted path needs a real session bus and a Flatpak sandbox, so unit
// coverage stops at the gate: outside Flatpak the module must decline to do
// anything, on every platform.
describe('backgroundPortal', () => {
	const originalFlatpakId = process.env.FLATPAK_ID;

	afterEach(() => {
		if (originalFlatpakId === undefined) {
			delete process.env.FLATPAK_ID;
		} else {
			process.env.FLATPAK_ID = originalFlatpakId;
		}
	});

	it('does not initialise without FLATPAK_ID', () => {
		delete process.env.FLATPAK_ID;
		assert.strictEqual(backgroundPortal.init(), false);
	});

	it('does not initialise outside linux even with FLATPAK_ID set', { skip: process.platform === 'linux' }, () => {
		process.env.FLATPAK_ID = 'com.github.IsmaelMartinez.teams_for_linux';
		assert.strictEqual(backgroundPortal.init(), false);
	});
});
