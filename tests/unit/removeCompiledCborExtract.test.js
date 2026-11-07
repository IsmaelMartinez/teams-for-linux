'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

const { removeCompiledCborExtract, COMPILED_BUILD_DIR } = require('../../scripts/removeCompiledCborExtract');

// Regression guard for #3192: the cbor-extract addon compiled on the build
// runner carried AVX instructions and crashed the app with SIGILL on CPUs
// without AVX. afterPack must ship only the upstream prebuilt.

const MODULES = join('resources', 'app.asar.unpacked', 'node_modules');

function touch(file) {
	mkdirSync(join(file, '..'), { recursive: true });
	writeFileSync(file, 'x');
}

describe('removeCompiledCborExtract (#3192)', () => {
	it('removes the locally compiled addon and keeps the prebuilt package', async () => {
		const appOutDir = mkdtempSync(join(tmpdir(), 'cbor-extract-'));
		try {
			const compiled = join(appOutDir, MODULES, 'cbor-extract', 'build', 'Release', 'extract.node');
			const prebuilt = join(appOutDir, MODULES, '@cbor-extract', 'cbor-extract-linux-x64', 'node.napi.glibc.node');
			const loader = join(appOutDir, MODULES, 'cbor-extract', 'index.js');
			touch(compiled);
			touch(prebuilt);
			touch(loader);

			await removeCompiledCborExtract(appOutDir);

			assert.ok(!existsSync(join(appOutDir, COMPILED_BUILD_DIR)), 'build/ must be gone');
			assert.ok(existsSync(prebuilt), 'the upstream prebuilt must stay');
			assert.ok(existsSync(loader), 'the rest of cbor-extract must stay');
		} finally {
			rmSync(appOutDir, { recursive: true, force: true });
		}
	});

	it('is a no-op when there is no compiled addon', async () => {
		const appOutDir = mkdtempSync(join(tmpdir(), 'cbor-extract-'));
		try {
			await assert.doesNotReject(removeCompiledCborExtract(appOutDir));
		} finally {
			rmSync(appOutDir, { recursive: true, force: true });
		}
	});

	it('runs from afterPack for Linux builds', () => {
		const source = readFileSync(join(__dirname, '..', '..', 'scripts', 'afterpack.js'), 'utf8');
		const linuxBlock = source.slice(source.indexOf('if (context.electronPlatformName === "linux")'));
		assert.match(linuxBlock.slice(0, 400), /removeCompiledCborExtract\(context\.appOutDir\)/);
	});
});
