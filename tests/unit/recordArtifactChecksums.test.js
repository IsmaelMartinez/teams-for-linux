'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
	isDistributable,
	listDistributables,
	formatChecksums,
	recordChecksums,
} = require('../../scripts/recordArtifactChecksums');

const sha256 = (text) => crypto.createHash('sha256').update(text).digest('hex');

describe('recordArtifactChecksums', () => {
	let root;

	before(() => {
		root = fs.mkdtempSync(path.join(os.tmpdir(), 'checksums-'));
	});

	after(() => {
		fs.rmSync(root, { recursive: true, force: true });
	});

	function makeDir(files) {
		const dir = fs.mkdtempSync(path.join(root, 'dist-'));
		for (const [name, content] of Object.entries(files)) {
			if (content === null) {
				fs.mkdirSync(path.join(dir, name));
			} else {
				fs.writeFileSync(path.join(dir, name), content);
			}
		}
		return dir;
	}

	it('recognises every distributable suffix', () => {
		for (const name of ['a.deb', 'a.rpm', 'a.AppImage', 'a.tar.gz', 'a.dmg', 'a.zip', 'a.exe']) {
			assert.ok(isDistributable(name), name);
		}
	});

	it('skips blockmaps, yaml files and other files', () => {
		for (const name of ['a.exe.blockmap', 'a.AppImage.blockmap', 'latest.yml', 'latest-linux.yaml', 'a.gz', 'notes.txt']) {
			assert.ok(!isDistributable(name), name);
		}
	});

	it('writes lowercase digest, two spaces, base name, sorted by name', () => {
		const dir = makeDir({
			'b.deb': 'bbb',
			'a.AppImage': 'aaa',
			'c.tar.gz': 'ccc',
		});
		const out = path.join(root, 'sorted.txt');
		recordChecksums(dir, out);
		assert.strictEqual(
			fs.readFileSync(out, 'utf8'),
			`${sha256('aaa')}  a.AppImage\n${sha256('bbb')}  b.deb\n${sha256('ccc')}  c.tar.gz\n`
		);
	});

	it('ignores blockmaps, yaml files and directories', () => {
		const dir = makeDir({
			'app.exe': 'exe',
			'app.exe.blockmap': 'map',
			'latest.yml': 'yml',
			'linux-unpacked': null,
			'folder.deb': null,
		});
		assert.deepStrictEqual(listDistributables(dir), ['app.exe']);
	});

	it('formats entries in shasum layout', () => {
		assert.strictEqual(
			formatChecksums([{ name: 'x.dmg', digest: 'ab' }]),
			'ab  x.dmg\n'
		);
	});

	it('fails with a clear message when there is no distributable', () => {
		const dir = makeDir({ 'latest.yml': 'yml', 'app.exe.blockmap': 'map' });
		const out = path.join(root, 'empty.txt');
		assert.throws(
			() => recordChecksums(dir, out),
			/No distributable files found/
		);
		assert.ok(!fs.existsSync(out));
	});
});
