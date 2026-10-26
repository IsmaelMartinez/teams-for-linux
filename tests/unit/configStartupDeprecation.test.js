'use strict';

// Drives the real loader in app/config/index.js (real yargs, real options.js)
// with Electron and the file logger stubbed, so the projection, the per-source
// presence checks and the startup warning are tested together, the way the
// app runs them.

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const stubbed = ['electron', '../../app/config/logger'].map((name) => require.resolve(name));
const originals = new Map();
let loadConfig;
const tempDirs = [];

before(() => {
	const stubs = [{ ipcMain: { emit() {} } }, { init() {} }];
	stubbed.forEach((modulePath, i) => {
		originals.set(modulePath, require.cache[modulePath]);
		require.cache[modulePath] = { id: modulePath, filename: modulePath, loaded: true, exports: stubs[i] };
	});
	loadConfig = require('../../app/config');
});

after(() => {
	for (const [modulePath, original] of originals) {
		if (original) require.cache[modulePath] = original;
		else delete require.cache[modulePath];
	}
	for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
});

// One fresh directory per call: the loader require()s config.json, and the
// module cache would otherwise hand a later case the first case's file.
function load({ file, args = [], env = {} } = {}) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 't4l-config-'));
	tempDirs.push(dir);
	if (file) fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(file));

	const savedArgv = process.argv;
	const savedEnv = {};
	const quiet = ['warn', 'info', 'debug'];
	const savedConsole = quiet.map((level) => console[level]);
	for (const key of Object.keys(env)) {
		savedEnv[key] = process.env[key];
		process.env[key] = env[key];
	}
	process.argv = ['teams-for-linux', ...args];
	for (const level of quiet) console[level] = () => {};
	try {
		return loadConfig(dir, '0.0.0-test');
	} finally {
		quiet.forEach((level, i) => {
			console[level] = savedConsole[i];
		});
		process.argv = savedArgv;
		for (const key of Object.keys(env)) {
			if (savedEnv[key] === undefined) delete process.env[key];
			else process.env[key] = savedEnv[key];
		}
	}
}

const deprecationWarnings = (config) =>
	(config.warnings || []).filter((w) => /configuration options? (is|are) deprecated/.test(w));

describe('startup deprecation warning reaches the modal', () => {
	it('appends one aggregated, sorted message to config.warnings', () => {
		const config = load({ file: { webDebug: false, url: 'https://example.invalid', appTitle: 'T' } });
		const warnings = deprecationWarnings(config);
		assert.strictEqual(warnings.length, 1);
		const names = [...warnings[0].matchAll(/^ {2}- (\w+)/gm)].map((m) => m[1]);
		assert.deepStrictEqual(names, ['appTitle', 'url', 'webDebug']);
		assert.match(warnings[0], /stop working in 2\.32\.0/);
		assert.match(warnings[0], /Settings > Show Updated Config…/);
	});

	// The acknowledgement hash in app/index.js is over this exact text.
	it('produces the same text on every launch with the same settings', () => {
		const file = { partition: 'p', webDebug: true };
		const first = deprecationWarnings(load({ file }));
		const second = deprecationWarnings(load({ file: { webDebug: true, partition: 'p' } }));
		assert.deepStrictEqual(first, second);
	});

	it('adds nothing when only nested names are used', () => {
		const config = load({ file: { app: { partition: 'p' }, development: { webDebug: true } } });
		assert.deepStrictEqual(deprecationWarnings(config), []);
	});

	it('never puts a configured value in the message', () => {
		const config = load({ file: { url: 'https://secret.example.invalid/tenant' } });
		assert.doesNotMatch(deprecationWarnings(config)[0], /secret/);
	});
});

describe('startup deprecation warning covers flags and environment variables', () => {
	it('reports a deprecated flat name passed as a command-line flag', () => {
		const [warning] = deprecationWarnings(load({ args: ['--webDebug'] }));
		assert.match(warning, /^ {2}- webDebug \(command line\)/m);
	});

	it('reports a deprecated flat name set as an environment variable', () => {
		const [warning] = deprecationWarnings(load({ env: { WEB_DEBUG: 'true' } }));
		assert.match(warning, /^ {2}- webDebug \(environment variable\)/m);
	});

	it('reports nothing for the nested name on the command line or in the environment', () => {
		assert.deepStrictEqual(deprecationWarnings(load({ args: ['--development.webDebug'] })), []);
		assert.deepStrictEqual(
			deprecationWarnings(load({ env: { DEVELOPMENT__WEB_DEBUG: 'true' } })),
			[]
		);
	});
});

describe('nested names from flags and environment variables reach the flat key', () => {
	it('projects a nested name from the command line', () => {
		assert.strictEqual(load({ args: ['--app.partition=nopersist'] }).partition, 'nopersist');
	});

	it('projects a nested name from the environment', () => {
		assert.strictEqual(load({ env: { APP__PARTITION: 'nopersist' } }).partition, 'nopersist');
	});

	// A string "false" would be truthy; it must arrive as the boolean, as the
	// flat --frame=false does.
	it('coerces a nested boolean from either source like the flat option', () => {
		assert.strictEqual(load({ args: ['--window.frame=false'] }).frame, false);
		assert.strictEqual(load({ env: { WINDOW__FRAME: 'false' } }).frame, false);
	});

	it('wraps a nested array leaf from the command line like the flat option', () => {
		const config = load({ args: ['--platform.spellCheckerLanguages=en-GB'] });
		assert.deepStrictEqual(config.spellCheckerLanguages, ['en-GB']);
	});

	it('counts a nested disableGpu from the command line as explicitly set', () => {
		const config = load({ args: ['--performance.disableGpu=false'] });
		assert.strictEqual(config.disableGpu, false);
		assert.strictEqual(config.disableGpuExplicitlySet, true);
	});
});

describe('precedence across sources at startup', () => {
	it('keeps the config file rule: nested beats flat', () => {
		const config = load({ file: { partition: 'flat', app: { partition: 'nested' } } });
		assert.strictEqual(config.partition, 'nested');
	});

	it('lets a command-line flat name beat a nested name in the config file', () => {
		const config = load({ file: { app: { partition: 'file' } }, args: ['--partition=cli'] });
		assert.strictEqual(config.partition, 'cli');
	});

	it('lets a command-line nested name beat a flat name in the config file', () => {
		const config = load({ file: { partition: 'file' }, args: ['--app.partition=cli'] });
		assert.strictEqual(config.partition, 'cli');
	});

	it('lets an environment nested name beat a nested name in the config file', () => {
		const config = load({ file: { app: { partition: 'file' } }, env: { APP__PARTITION: 'env' } });
		assert.strictEqual(config.partition, 'env');
	});

	it('lets a command-line flat name beat an environment nested name', () => {
		const config = load({ args: ['--partition=cli'], env: { APP__PARTITION: 'env' } });
		assert.strictEqual(config.partition, 'cli');
	});

	it('lets a command-line nested name beat an environment flat name', () => {
		const config = load({ args: ['--app.partition=cli'], env: { PARTITION: 'env' } });
		assert.strictEqual(config.partition, 'cli');
	});
});

// Chromium reads these switches itself and our docs tell users to pass
// --disable-gpu, so they stay supported for good and never warn.
describe('Chromium switch aliases at startup', () => {
	const gpuLine = (config) => deprecationWarnings(config).filter((w) => /- disableGpu /.test(w));

	it('does not warn for --disable-gpu, and the value still lands and counts as explicit', () => {
		for (const args of [['--disable-gpu'], ['--disable-gpu=true'], ['--disable-gpu', 'true']]) {
			const config = load({ args });
			assert.deepStrictEqual(gpuLine(config), [], args.join(' '));
			assert.strictEqual(config.disableGpu, true);
			assert.strictEqual(config.disableGpuExplicitlySet, true);
		}
	});

	it('still warns for our own spellings', () => {
		const [cli] = deprecationWarnings(load({ args: ['--disableGpu'] }));
		assert.match(cli, /^ {2}- disableGpu \(command line\)/m);
		const [env] = deprecationWarnings(load({ env: { DISABLE_GPU: 'true' } }));
		assert.match(env, /^ {2}- disableGpu \(environment variable\)/m);
	});

	it('warns once for the camelCase spelling when both are passed', () => {
		const warnings = deprecationWarnings(load({ args: ['--disable-gpu', '--disableGpu'] }));
		assert.strictEqual(warnings.length, 1);
		assert.strictEqual(warnings[0].match(/- disableGpu \(command line\)/g).length, 1);
	});

	it('passes --proxy-server and --auth-server-whitelist values through', () => {
		const config = load({
			args: ['--proxy-server', 'localhost:3128', '--auth-server-whitelist=*.example.invalid'],
		});
		assert.strictEqual(config.proxyServer, 'localhost:3128');
		assert.strictEqual(config.authServerWhitelist, '*.example.invalid');
	});
});
