'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
	writeMigratedConfig,
	MIGRATED_FILE,
} = require('../../app/config/migrateFile');

let dir;

function writeConfig(contents) {
	fs.writeFileSync(
		path.join(dir, 'config.json'),
		typeof contents === 'string' ? contents : JSON.stringify(contents),
		'utf8',
	);
}

function readMigrated() {
	return JSON.parse(fs.readFileSync(path.join(dir, MIGRATED_FILE), 'utf8'));
}

describe('writeMigratedConfig', () => {
	beforeEach(() => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tfl-migrate-'));
	});

	afterEach(() => {
		fs.rmSync(dir, { recursive: true, force: true });
	});

	it('reports no-config when there is no config.json', () => {
		assert.strictEqual(writeMigratedConfig(dir).status, 'no-config');
	});

	it('reports nothing-to-migrate when no deprecated name is used', () => {
		writeConfig({ mqtt: { enabled: true } });
		assert.strictEqual(writeMigratedConfig(dir).status, 'nothing-to-migrate');
	});

	it('writes the migrated copy and names what moved', () => {
		writeConfig({ clearStorageData: true, mqtt: { enabled: false } });
		const result = writeMigratedConfig(dir);

		assert.strictEqual(result.status, 'written');
		assert.deepStrictEqual(result.renamed, ['clearStorageData']);
		assert.deepStrictEqual(readMigrated(), {
			mqtt: { enabled: false },
			storage: { clearData: true },
		});
	});

	// The whole point of writing a copy: a bad migration must not be able to
	// break a working install.
	it('leaves config.json exactly as it was', () => {
		const original = { clearStorageData: true };
		writeConfig(original);
		writeMigratedConfig(dir);

		assert.deepStrictEqual(
			JSON.parse(fs.readFileSync(path.join(dir, 'config.json'), 'utf8')),
			original,
		);
	});

	it('surfaces validator warnings about the copy it wrote', () => {
		// A scalar for an array option: yargs coerces it under the flat name,
		// the nested leaf does not, so the validator is the safety net.
		writeConfig({ globalShortcuts: 'Control+Shift+M', clearStorageData: 'yes' });
		const result = writeMigratedConfig(dir);

		assert.strictEqual(result.status, 'written');
		assert.ok(
			result.warnings.some((w) => w.includes('storage.clearData')),
			`expected a warning naming storage.clearData, got ${JSON.stringify(result.warnings)}`,
		);
	});

	it('reports failed rather than throwing on an unreadable config', () => {
		writeConfig('{ not json');
		const result = writeMigratedConfig(dir);

		assert.strictEqual(result.status, 'failed');
		assert.ok(result.error, 'expected an error message');
	});

	// Values never reach the caller, which puts them on screen and in the log.
	it('returns option names only, never values', () => {
		writeConfig({ clearStorageData: true, customBGServiceBaseUrl: 'https://secret.example/x' });
		const result = writeMigratedConfig(dir);

		const surfaced = JSON.stringify({
			status: result.status,
			renamed: result.renamed,
			warnings: result.warnings,
		});
		assert.ok(!surfaced.includes('secret.example'), `value leaked: ${surfaced}`);
	});
});
