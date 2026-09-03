'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const {
	mkdirSync,
	mkdtempSync,
	lstatSync,
	readFileSync,
	rmSync,
	writeFileSync,
} = require('node:fs');
const { tmpdir } = require('node:os');
const { join, relative, resolve, sep } = require('node:path');

const { Arch } = require('builder-util');
const {
	patchScript,
	patchSnapDesktopLauncher,
	BUNDLED_TEMPLATE_SCRIPT,
	ORIGINAL_BLOCK,
	PATCHED_BLOCK,
	PATCH_MARKER,
} = require('../../scripts/patchSnapDesktopLauncher');

// Regression guard for #2946. electron-builder's core22 snap launcher runs
// desktop-common.sh under `set -e` with an unguarded `rmdir`, so the snap exits
// 1 with completely empty output. scripts/patchSnapDesktopLauncher.js fixes the
// script at build time; these tests exercise the real launcher, not a fixture.

// A build may already have patched the copy in node_modules, so restore the
// pristine block first. String replace, first occurrence only, no regex.
function unpatchedSource() {
	const source = readFileSync(BUNDLED_TEMPLATE_SCRIPT, 'utf8');
	return source.includes(PATCH_MARKER) ? source.replace(PATCHED_BLOCK, ORIGINAL_BLOCK) : source;
}

function makeTempDir() {
	return mkdtempSync(join(tmpdir(), 'snap-launcher-'));
}

function writeScript(dir, source) {
	const file = join(dir, 'desktop-common.sh');
	writeFileSync(file, source, { mode: 0o755 });
	return file;
}

// The launcher calls `realpath --relative-to`, which is GNU-only. Shim it with
// node so the fragment behaves identically on every developer machine and in CI.
function writeRealpathShim(dir) {
	const binDir = join(dir, 'bin');
	mkdirSync(binDir);
	const shim = [
		'#!/bin/sh',
		'exec node -e \'const p=require("path");const a=process.argv.slice(1);' +
			'let rel=null;const paths=[];' +
			'for(const x of a){if(x.startsWith("--relative-to="))rel=x.slice(14);else paths.push(x);}' +
			'const t=p.resolve(paths[0]);console.log(rel?p.relative(p.resolve(rel),t):t);\' "$@"',
		'',
	].join('\n');
	writeFileSync(join(binDir, 'realpath'), shim, { mode: 0o755 });
	return binDir;
}

// Slice the whole "Create links for user-dirs.dirs" section out of the launcher
// with two literal lookups, then run it exactly as the snap does: bash -e.
function extractXdgLinksBlock(source) {
	const start = source.indexOf('# Create links for user-dirs.dirs');
	assert.ok(start >= 0, 'launcher no longer has the user-dirs section');
	const end = source.indexOf('\n# If detect wayland server socket', start);
	assert.ok(end > start, 'launcher no longer has the wayland section after it');
	return source.slice(start, end);
}

/**
 * Runs the XDG-links block under `bash -e` against a throwaway home.
 *
 * @param {object} options
 * @param {string} options.scriptPath desktop-common.sh to take the block from.
 * @param {"inside"|"escape"} options.placement where the XDG user dir lives.
 * @param {boolean} options.emptyXdgDir leave the XDG dir empty (rmdir succeeds).
 */
function runXdgLinksBlock({ scriptPath, placement, emptyXdgDir = false }) {
	const root = makeTempDir();
	try {
		// `[ -e "$REALHOME/$b" ]` climbs three levels past the common ancestor,
		// because $b is relative to the snap home three directories deeper. Pad
		// the fake filesystem so that overshoot stays inside the temp root
		// instead of reaching into the real one (on a shallow /tmp it lands on
		// /mnt).
		const fsRoot = join(root, 'pad-1', 'pad-2', 'pad-3', 'fs');
		const realHome = join(fsRoot, 'home', 'user');
		const snapHome = join(realHome, 'snap', 'teams-for-linux', '2396');
		mkdirSync(snapHome, { recursive: true });

		const xdgDir =
			placement === 'escape'
				? join(fsRoot, 'mnt', 'hdd', 'documents')
				: join(snapHome, 'Documents');
		mkdirSync(xdgDir, { recursive: true });
		if (!emptyXdgDir) {
			writeFileSync(join(xdgDir, 'keepme'), 'x');
		}

		if (placement === 'escape') {
			// Create what the overshooting test resolves to, so the guard passes
			// and we reproduce the reporter's trace (theirs clamped at /).
			const decoy = resolve(realHome, relative(snapHome, xdgDir));
			assert.ok(decoy.startsWith(root + sep), `decoy ${decoy} escaped the sandbox`);
			mkdirSync(decoy, { recursive: true });
		} else {
			mkdirSync(join(realHome, 'Documents'), { recursive: true });
		}

		const fragment = join(root, 'fragment.sh');
		writeFileSync(
			fragment,
			[
				'#!/bin/bash -e',
				`HOME="${snapHome}"`,
				`REALHOME="${realHome}"`,
				'needs_xdg_links=true',
				`XDG_SPECIAL_DIRS_PATHS=("${xdgDir}")`,
				'XDG_SPECIAL_DIRS=(XDG_DOCUMENTS_DIR)',
				`XDG_SPECIAL_DIRS_INITIAL_PATHS=("${xdgDir}")`,
				extractXdgLinksBlock(readFileSync(scriptPath, 'utf8')),
				'echo REACHED_END',
				'',
			].join('\n'),
			{ mode: 0o755 },
		);

		// -e explicitly: `bash <file>` ignores the shebang's flags, and `set -e`
		// is the whole point of the reproduction.
		const result = spawnSync('bash', ['-e', fragment], {
			encoding: 'utf8',
			env: { ...process.env, PATH: `${writeRealpathShim(root)}:${process.env.PATH}` },
		});
		return {
			status: result.status,
			output: `${result.stdout}${result.stderr}`,
			xdgDirIsRealDirectory: lstatSync(xdgDir, { throwIfNoEntry: false })?.isDirectory() === true,
		};
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
}

describe('snap desktop launcher patch (#2946)', () => {
	it('electron-builder still ships the unguarded rmdir block the patch targets', () => {
		assert.ok(
			unpatchedSource().includes(ORIGINAL_BLOCK),
			'the launcher changed upstream — re-check the #2946 workaround',
		);
	});

	it('adds the || true guard and the escaping-path skip', async () => {
		const dir = makeTempDir();
		try {
			const file = writeScript(dir, unpatchedSource());
			assert.strictEqual(await patchScript(file), true);

			const patched = readFileSync(file, 'utf8');
			assert.ok(patched.includes('rmdir "$HOME/$b" 2> /dev/null || true'));
			assert.ok(patched.includes('if [ "$b" = ".." ] || [ "${b#../}" != "$b" ]; then'));
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it('is idempotent', async () => {
		const dir = makeTempDir();
		try {
			const file = writeScript(dir, unpatchedSource());
			await patchScript(file);
			const afterFirst = readFileSync(file, 'utf8');

			assert.strictEqual(await patchScript(file), false);
			assert.strictEqual(readFileSync(file, 'utf8'), afterFirst);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it('throws instead of silently doing nothing when the block is missing', async () => {
		const dir = makeTempDir();
		try {
			const file = writeScript(dir, '#!/bin/bash -e\necho nothing to patch here\n');
			await assert.rejects(() => patchScript(file), /expected rmdir block was not found/);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it('unpatched: a failing rmdir kills the launcher with status 1 and no output', () => {
		const dir = makeTempDir();
		try {
			const file = writeScript(dir, unpatchedSource());
			const run = runXdgLinksBlock({ scriptPath: file, placement: 'inside' });
			assert.strictEqual(run.status, 1);
			assert.strictEqual(run.output, '');
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it('patched: a failing rmdir no longer stops the launcher', async () => {
		const dir = makeTempDir();
		try {
			const file = writeScript(dir, unpatchedSource());
			await patchScript(file);

			for (const placement of ['inside', 'escape']) {
				const run = runXdgLinksBlock({ scriptPath: file, placement });
				assert.strictEqual(run.status, 0, `${placement} exited ${run.status}`);
				assert.match(run.output, /REACHED_END/);
			}
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	// arm64 takes the no-template path: it must patch the bundled script and
	// never reach for the downloaded snap template, which would need the network.
	// electronGet is required lazily inside patchDownloadedTemplate, so its
	// absence from the module cache proves that branch was skipped.
	it('arm64 patches only the bundled launcher, never the downloaded template', async () => {
		const electronGet = require.resolve('app-builder-lib/out/util/electronGet');
		const original = readFileSync(BUNDLED_TEMPLATE_SCRIPT, 'utf8');
		delete require.cache[electronGet];
		try {
			await patchSnapDesktopLauncher(Arch.arm64);

			assert.ok(
				!(electronGet in require.cache),
				'arm64 must not load the downloaded-template code path',
			);
			assert.ok(readFileSync(BUNDLED_TEMPLATE_SCRIPT, 'utf8').includes(PATCH_MARKER));
		} finally {
			writeFileSync(BUNDLED_TEMPLATE_SCRIPT, original, { mode: 0o755 });
		}
	});

	it('patched: an empty XDG dir outside the snap home is left alone', async () => {
		const dir = makeTempDir();
		try {
			const file = writeScript(dir, unpatchedSource());

			const before = runXdgLinksBlock({
				scriptPath: file,
				placement: 'escape',
				emptyXdgDir: true,
			});
			assert.strictEqual(before.xdgDirIsRealDirectory, false, 'expected the unguarded script to replace it');

			await patchScript(file);
			const after = runXdgLinksBlock({ scriptPath: file, placement: 'escape', emptyXdgDir: true });
			assert.strictEqual(after.xdgDirIsRealDirectory, true);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
