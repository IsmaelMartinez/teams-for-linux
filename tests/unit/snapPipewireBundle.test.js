'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { createHash } = require('node:crypto');
const { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { Arch } = require('builder-util');

const {
	bundleSnapPipewire,
	installBundle,
	verifyChecksum,
	debFileName,
	packageUrl,
	PACKAGES_BY_ARCH,
	CLIENT_MODULES,
	BUNDLE_DIR,
} = require('../../scripts/bundleSnapPipewire');

const packageJson = require('../../package.json');

// Regression guard for #3180: the snap ships no libpipewire, so Chromium falls
// back to the X11 capturer on Wayland. scripts/bundleSnapPipewire.js bundles the
// jammy client library at build time.

const TRIPLET = 'x86_64-linux-gnu';

function makeTempDir() {
	return mkdtempSync(join(tmpdir(), 'snap-pipewire-'));
}

function touch(file, content = 'x') {
	mkdirSync(join(file, '..'), { recursive: true });
	writeFileSync(file, content);
}

// Mirrors the file layout dpkg-deb -x produces for the four jammy packages,
// plus server-only modules and plugins that must not be copied.
function fakeExtractedRoot(root) {
	const lib = join(root, 'usr', 'lib', TRIPLET);
	touch(join(lib, 'libpipewire-0.3.so.0.348.0'), 'real-library');
	touch(join(lib, 'libpipewire-0.3.so.0'), 'symlink-stand-in');
	for (const name of [...CLIENT_MODULES, 'protocol-pulse', 'raop-sink']) {
		touch(join(lib, 'pipewire-0.3', `libpipewire-module-${name}.so`));
	}
	touch(join(lib, 'spa-0.2', 'support', 'libspa-support.so'));
	touch(join(lib, 'spa-0.2', 'support', 'libspa-dbus.so'));
	touch(join(lib, 'spa-0.2', 'videoconvert', 'libspa-videoconvert.so'));
	touch(join(lib, 'spa-0.2', 'alsa', 'libspa-alsa.so'));
	touch(join(root, 'usr', 'share', 'pipewire', 'client.conf'));
	touch(join(root, 'usr', 'share', 'pipewire', 'client-rt.conf'));
	touch(join(root, 'usr', 'share', 'pipewire', 'pipewire.conf'));
}

describe('snap libpipewire bundle (#3180)', () => {
	it('installs the client library next to the binary and the rest under pipewire/', async () => {
		const dir = makeTempDir();
		try {
			const extracted = join(dir, 'root');
			const appOutDir = join(dir, 'app');
			fakeExtractedRoot(extracted);
			mkdirSync(appOutDir);

			await installBundle(extracted, appOutDir, TRIPLET);

			// The Electron binary's RPATH is $ORIGIN, so the soname must sit beside it
			// and be the real versioned file, not the dangling symlink.
			assert.strictEqual(readFileSync(join(appOutDir, 'libpipewire-0.3.so.0'), 'utf8'), 'real-library');

			const modules = readdirSync(join(appOutDir, BUNDLE_DIR, 'modules')).sort();
			assert.deepStrictEqual(modules, CLIENT_MODULES.map((name) => `libpipewire-module-${name}.so`).sort());

			assert.ok(existsSync(join(appOutDir, BUNDLE_DIR, 'spa-0.2', 'support', 'libspa-support.so')));
			assert.ok(existsSync(join(appOutDir, BUNDLE_DIR, 'spa-0.2', 'videoconvert', 'libspa-videoconvert.so')));
			assert.ok(!existsSync(join(appOutDir, BUNDLE_DIR, 'spa-0.2', 'alsa')), 'server-side plugins stay out');

			assert.deepStrictEqual(readdirSync(join(appOutDir, BUNDLE_DIR, 'conf')).sort(), ['client-rt.conf', 'client.conf']);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it('fails loudly when the package layout changes', async () => {
		const dir = makeTempDir();
		try {
			const extracted = join(dir, 'root');
			mkdirSync(join(extracted, 'usr', 'lib', TRIPLET), { recursive: true });
			await assert.rejects(installBundle(extracted, join(dir, 'app'), TRIPLET), /libpipewire-0\.3\.so\.0\.\* not found/);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it('rejects a download whose checksum does not match', () => {
		const data = Buffer.from('payload');
		const good = createHash('sha256').update(data).digest('hex');
		assert.doesNotThrow(() => verifyChecksum('a.deb', data, good));
		assert.throws(() => verifyChecksum('a.deb', data, '0'.repeat(64)), /checksum mismatch for a\.deb/);
	});

	it('pins x64 packages to Launchpad with full sha256 checksums', () => {
		const spec = PACKAGES_BY_ARCH.get(Arch.x64);
		assert.ok(spec, 'x64 must have pinned packages');
		for (const sha256 of Object.values(spec.packages)) {
			assert.match(sha256, /^[0-9a-f]{64}$/);
		}
		const fileName = debFileName('libpipewire-0.3-0', Arch.x64);
		assert.match(fileName, /^libpipewire-0\.3-0_0\.3\.48-.+_amd64\.deb$/);
		assert.strictEqual(packageUrl(fileName), `https://launchpad.net/ubuntu/+archive/primary/+files/${fileName}`);
	});

	// arm64 is packed by snapcraft and has no pinned packages yet: it must be
	// skipped without touching the network or the app directory.
	it('skips architectures without pinned packages', async () => {
		const dir = makeTempDir();
		try {
			assert.strictEqual(await bundleSnapPipewire(dir, Arch.arm64), false);
			assert.deepStrictEqual(readdirSync(dir), []);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it('points the snap environment at the bundled directories', () => {
		const environment = packageJson.build.snap.environment;
		assert.strictEqual(environment.SPA_PLUGIN_DIR, `$SNAP/${BUNDLE_DIR}/spa-0.2`);
		assert.strictEqual(environment.PIPEWIRE_MODULE_DIR, `$SNAP/${BUNDLE_DIR}/modules`);
		assert.strictEqual(environment.PIPEWIRE_CONFIG_DIR, `$SNAP/${BUNDLE_DIR}/conf`);
	});
});
