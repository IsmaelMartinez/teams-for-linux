const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');

// Mock electron-log before requiring Logger
const mockClearFn = () => Promise.resolve();
const mockLog = {
  debug: (...args) => mockLog._calls.debug.push(args),
  info: (...args) => mockLog._calls.info.push(args),
  warn: (...args) => mockLog._calls.warn.push(args),
  error: (...args) => mockLog._calls.error.push(args),
  _calls: {
    debug: [],
    info: [],
    warn: [],
    error: []
  },
  _resetCalls() {
    this._calls.debug = [];
    this._calls.info = [];
    this._calls.warn = [];
    this._calls.error = [];
  },
  transports: {
    file: {
      level: 'info',
      maxSize: 10 * 1024 * 1024,
      format: '',
      getFile: () => ({ path: '/mock/path/log.txt', clear: mockClearFn })
    },
    console: {
      level: 'info',
      format: ''
    }
  }
};

// Mock require for electron-log
require.cache[require.resolve('electron-log')] = {
  exports: mockLog
};

const Logger = require('../../../../../app/domains/infrastructure/services/Logger');

describe('Logger Service', () => {
  describe('Constructor', () => {
    it('should create logger with default options', () => {
      const logger = new Logger();

      assert.strictEqual(logger.getLevel(), 'info');
      assert.strictEqual(logger.getNamespace(), 'app');
    });

    it('should create logger with custom options', () => {
      const logger = new Logger({
        level: 'debug',
        namespace: 'test-domain',
        context: { userId: '123' }
      });

      assert.strictEqual(logger.getLevel(), 'debug');
      assert.strictEqual(logger.getNamespace(), 'test-domain');
    });

    it('should configure electron-log transports', () => {
      const logger = new Logger({ level: 'warn' });

      assert.strictEqual(mockLog.transports.file.level, 'warn');
      assert.strictEqual(mockLog.transports.console.level, 'warn');
    });
  });

  describe('Log Levels', () => {
    beforeEach(() => {
      mockLog._resetCalls();
    });

    it('should log debug messages when level is debug', () => {
      const logger = new Logger({ level: 'debug', namespace: 'test' });
      logger.debug('Debug message', { key: 'value' });

      assert.strictEqual(mockLog._calls.debug.length, 1);
      const loggedMessage = mockLog._calls.debug[0][0];
      assert.ok(loggedMessage.includes('Debug message'));
      assert.ok(loggedMessage.includes('test'));
    });

    it('should not log debug messages when level is info', () => {
      const logger = new Logger({ level: 'info', namespace: 'test' });
      logger.debug('Debug message');

      assert.strictEqual(mockLog._calls.debug.length, 0);
    });

    it('should log info messages when level is info', () => {
      const logger = new Logger({ level: 'info', namespace: 'test' });
      logger.info('Info message', { status: 'ok' });

      assert.strictEqual(mockLog._calls.info.length, 1);
      const loggedMessage = mockLog._calls.info[0][0];
      assert.ok(loggedMessage.includes('Info message'));
    });

    it('should log warn messages', () => {
      const logger = new Logger({ level: 'warn', namespace: 'test' });
      logger.warn('Warning message');

      assert.strictEqual(mockLog._calls.warn.length, 1);
    });

    it('should log error messages with error data', () => {
      const logger = new Logger({ level: 'error', namespace: 'test' });
      logger.error('Error occurred', { error: 'Test error', stack: 'stack trace' });

      assert.strictEqual(mockLog._calls.error.length, 1);
      const loggedMessage = mockLog._calls.error[0][0];
      assert.ok(loggedMessage.includes('Error occurred'));
      assert.ok(loggedMessage.includes('Test error'));
    });

    it('should respect log level hierarchy', () => {
      const logger = new Logger({ level: 'warn' });

      logger.debug('Debug');
      logger.info('Info');
      logger.warn('Warn');
      logger.error('Error');

      assert.strictEqual(mockLog._calls.debug.length, 0);
      assert.strictEqual(mockLog._calls.info.length, 0);
      assert.strictEqual(mockLog._calls.warn.length, 1);
      assert.strictEqual(mockLog._calls.error.length, 1);
    });
  });

  describe('Message Formatting', () => {
    beforeEach(() => {
      mockLog._resetCalls();
    });

    it('should format messages with namespace', () => {
      const logger = new Logger({ namespace: 'my-domain' });
      logger.info('Test message');

      const loggedMessage = mockLog._calls.info[0][0];
      assert.ok(loggedMessage.includes('[my-domain]'));
      assert.ok(loggedMessage.includes('Test message'));
    });

    it('should include structured data in message', () => {
      const logger = new Logger({ namespace: 'test' });
      logger.info('Event occurred', { eventId: '456', type: 'click' });

      const loggedMessage = mockLog._calls.info[0][0];
      assert.ok(loggedMessage.includes('eventId'));
      assert.ok(loggedMessage.includes('456'));
      assert.ok(loggedMessage.includes('type'));
      assert.ok(loggedMessage.includes('click'));
    });

    it('should include context in formatted message', () => {
      const logger = new Logger({
        namespace: 'test',
        context: { userId: 'user123', sessionId: 'sess456' }
      });
      logger.info('User action');

      const loggedMessage = mockLog._calls.info[0][0];
      assert.ok(loggedMessage.includes('userId'));
      assert.ok(loggedMessage.includes('user123'));
      assert.ok(loggedMessage.includes('sessionId'));
      assert.ok(loggedMessage.includes('sess456'));
    });

    it('should format as JSON when format is json', () => {
      const logger = new Logger({ namespace: 'test', format: 'json' });
      logger.info('JSON message', { key: 'value' });

      const loggedMessage = mockLog._calls.info[0][0];
      const parsed = JSON.parse(loggedMessage);

      assert.strictEqual(parsed.message, 'JSON message');
      assert.strictEqual(parsed.namespace, 'test');
      assert.strictEqual(parsed.key, 'value');
    });
  });

  describe('Child Loggers', () => {
    it('should create child logger with merged context', () => {
      const parentLogger = new Logger({
        namespace: 'parent',
        level: 'debug',
        context: { app: 'teams-for-linux' }
      });

      const childLogger = parentLogger.child('child', { component: 'auth' });

      assert.strictEqual(childLogger.getNamespace(), 'child');
      assert.strictEqual(childLogger.getLevel(), 'debug');
    });

    it('should include both parent and child context in logs', () => {
      mockLog._resetCalls();

      const parentLogger = new Logger({
        namespace: 'parent',
        context: { app: 'teams' }
      });

      const childLogger = parentLogger.child('child', { module: 'login' });
      childLogger.info('Child log');

      const loggedMessage = mockLog._calls.info[0][0];
      assert.ok(loggedMessage.includes('app'));
      assert.ok(loggedMessage.includes('teams'));
      assert.ok(loggedMessage.includes('module'));
      assert.ok(loggedMessage.includes('login'));
    });
  });

  describe('Context Management', () => {
    it('should update context dynamically', () => {
      mockLog._resetCalls();

      const logger = new Logger({ namespace: 'test', context: { step: '1' } });
      logger.info('First log');

      logger.updateContext({ step: '2', status: 'processing' });
      logger.info('Second log');

      const firstLog = mockLog._calls.info[0][0];
      const secondLog = mockLog._calls.info[1][0];

      assert.ok(firstLog.includes('"step":"1"'));
      assert.ok(secondLog.includes('"step":"2"'));
      assert.ok(secondLog.includes('status'));
      assert.ok(secondLog.includes('processing'));
    });
  });

  describe('Dynamic Level Changes', () => {
    it('should change log level dynamically', () => {
      const logger = new Logger({ level: 'info' });

      assert.strictEqual(logger.getLevel(), 'info');

      logger.setLevel('debug');

      assert.strictEqual(logger.getLevel(), 'debug');
      assert.strictEqual(mockLog.transports.file.level, 'debug');
      assert.strictEqual(mockLog.transports.console.level, 'debug');
    });

    it('should throw error for invalid log level', () => {
      const logger = new Logger();

      assert.throws(() => {
        logger.setLevel('invalid');
      }, /Invalid log level/);
    });

    it('should accept all valid log levels', () => {
      const logger = new Logger();
      const validLevels = ['debug', 'info', 'warn', 'error'];

      for (const level of validLevels) {
        assert.doesNotThrow(() => {
          logger.setLevel(level);
        });
        assert.strictEqual(logger.getLevel(), level);
      }
    });
  });

  describe('Log File Management', () => {
    it('should return log file path', () => {
      const logger = new Logger();
      const path = logger.getLogFilePath();

      assert.strictEqual(path, '/mock/path/log.txt');
    });

    it('should clear logs', async () => {
      const logger = new Logger();

      await logger.clearLogs();

      // Verify clearLogs was called (just check it doesn't throw)
      assert.ok(true);
    });
  });

  describe('Statistics', () => {
    it('should return logger statistics', () => {
      const logger = new Logger({
        level: 'debug',
        namespace: 'test-domain',
        format: 'text',
        context: { userId: '123' }
      });

      const stats = logger.getStats();

      assert.strictEqual(stats.level, 'debug');
      assert.strictEqual(stats.namespace, 'test-domain');
      assert.strictEqual(stats.format, 'text');
      assert.deepStrictEqual(stats.context, { userId: '123' });
      assert.strictEqual(stats.logFile, '/mock/path/log.txt');
    });

    it('should return empty context when no context provided', () => {
      const logger = new Logger();
      const stats = logger.getStats();

      assert.deepStrictEqual(stats.context, {});
    });
  });

  describe('Edge Cases', () => {
    it('should handle logging with empty data object', () => {
      mockLog._resetCalls();

      const logger = new Logger({ namespace: 'test' });
      logger.info('Message with empty data', {});

      assert.strictEqual(mockLog._calls.info.length, 1);
    });

    it('should handle logging with null data', () => {
      mockLog._resetCalls();

      const logger = new Logger({ namespace: 'test' });
      logger.info('Message with null');

      assert.strictEqual(mockLog._calls.info.length, 1);
    });

    it('should handle complex nested data structures', () => {
      mockLog._resetCalls();

      const logger = new Logger({ namespace: 'test' });
      logger.info('Complex data', {
        nested: { deeply: { value: 'test' } },
        array: [1, 2, 3],
        mixed: { a: [{ b: 'c' }] }
      });

      assert.strictEqual(mockLog._calls.info.length, 1);
      const loggedMessage = mockLog._calls.info[0][0];
      assert.ok(loggedMessage.includes('nested'));
    });
  });
});
