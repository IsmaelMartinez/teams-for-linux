'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

// Regression guard for #3192 and the v2.31.0 Flatpak failure: the cbor-extract
// addon compiled on the build runner carries AVX instructions (SIGILL without
// AVX), so it must not ship and the loader must use the upstream prebuilt.
// It has to be excluded by the `files` filter, which electron-builder applies
// after rebuilding dependencies and before building app.asar. Deleting it in
// afterPack leaves `unpack` entries in the asar header for files that no longer
// exist, which makes the Flatpak asar patch step fail.

const root = join(__dirname, '..', '..');
const { build } = require(join(root, 'package.json'));

describe('compiled cbor-extract packaging (#3192)', () => {
	it('excludes the compiled build directory from Linux packages', () => {
		assert.ok(
			build.linux.files.includes('!**/node_modules/cbor-extract/build{,/**}'),
			'linux.files must exclude node_modules/cbor-extract/build'
		);
	});

	it('does not delete from app.asar.unpacked in afterPack', () => {
		const source = readFileSync(join(root, 'scripts', 'afterpack.js'), 'utf8');
		assert.doesNotMatch(source, /app\.asar\.unpacked|cbor-extract/i);
	});
});
