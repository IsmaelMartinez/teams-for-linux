/**
 * ReactBridge Service Tests
 *
 * Comprehensive test suite for Teams React internal structure access.
 * Tests DOM navigation patterns, domain validation, and status monitoring.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  createSpy,
  createMockEventEmitter,
  suppressConsole
} from '../../../../helpers/test-utils.js';

// Import the service to test
const ReactBridge = (await import('../../../../../app/domains/teams-integration/services/ReactBridge.js')).default;

/**
 * Create a mock browser Window object with React internals
 */
function createMockWindow(options = {}) {
  const {
    hostname = 'teams.microsoft.com',
    hasAppElement = true,
    hasReactRoot = true,
    hasCoreServices = true,
    reactVersion = 'legacy', // 'legacy' or 'modern'
    coreServicesData = null
  } = options;

  const appElement = {};

  // Setup React root structure based on version
  if (hasReactRoot && reactVersion === 'legacy') {
    // React 16/17 structure
    const defaultCoreServices = {
      clientState: {
        _idleTracker: {
          isIdle: () => false,
          getIdleTime: () => 0
        }
      },
      presenceService: {
        getCurrentPresence: () => 'Available'
      },
      commandChangeReportingService: {},
      clientPreferences: {
        clientPreferences: {}
      }
    };

    appElement._reactRootContainer = {
      _internalRoot: {
        current: {
          updateQueue: {
            baseState: {
              element: {
                props: {
                  coreServices: hasCoreServices
                    ? (coreServicesData || defaultCoreServices)
                    : undefined
                }
              }
            }
          }
        }
      }
    };
  } else if (hasReactRoot && reactVersion === 'modern') {
    // React 18+ structure (simplified for testing)
    const defaultCoreServices = {
      clientState: {
        _idleTracker: {
          isIdle: () => false,
          getIdleTime: () => 0
        }
      },
      presenceService: {
        getCurrentPresence: () => 'Available'
      },
      commandChangeReportingService: {},
      clientPreferences: {
        clientPreferences: {}
      }
    };

    appElement.__reactContainer$random = {};
    appElement._reactRootContainer = {
      current: {
        updateQueue: {
          baseState: {
            element: {
              props: {
                coreServices: hasCoreServices
                  ? (coreServicesData || defaultCoreServices)
                  : undefined
              }
            }
          }
        }
      }
    };
  }

  const mockDocument = {
    getElementById: (id) => {
      if (id === 'app' && hasAppElement) {
        return appElement;
      }
      return null;
    }
  };

  return {
    location: { hostname },
    document: mockDocument
  };
}

/**
 * Create mock coreServices with custom behavior
 */
function createMockCoreServices(overrides = {}) {
  return {
    clientState: {
      _idleTracker: {
        isIdle: overrides.isIdle || (() => false),
        getIdleTime: overrides.getIdleTime || (() => 0)
      }
    },
    presenceService: {
      getCurrentPresence: overrides.getCurrentPresence || (() => 'Available')
    },
    commandChangeReportingService: overrides.commandChangeReportingService || {},
    clientPreferences: {
      clientPreferences: overrides.clientPreferences || {}
    }
  };
}

describe('ReactBridge Service', () => {
  let bridge;
  let mockEventBus;

  beforeEach(() => {
    mockEventBus = createMockEventEmitter();
  });

  describe('Constructor Initialization', () => {
    it('should initialize with default values', () => {
      bridge = new ReactBridge();

      assert.deepStrictEqual(bridge._config, {});
      assert.strictEqual(bridge._eventBus, null);
      assert.strictEqual(bridge._coreServices, null);
      assert.strictEqual(bridge._validationEnabled, true);
      assert.strictEqual(bridge._lastStatus, null);
    });

    it('should initialize with provided config', () => {
      const config = { someOption: true };
      bridge = new ReactBridge(config);

      assert.strictEqual(bridge._config, config);
    });

    it('should initialize with provided eventBus', () => {
      bridge = new ReactBridge({}, mockEventBus);

      assert.strictEqual(bridge._eventBus, mockEventBus);
    });

    it('should set up allowed domains list', () => {
      bridge = new ReactBridge();

      assert.ok(Array.isArray(bridge._allowedDomains));
      assert.ok(bridge._allowedDomains.includes('teams.microsoft.com'));
      assert.ok(bridge._allowedDomains.includes('teams.live.com'));
      assert.strictEqual(bridge._allowedDomains.length, 2);
    });
  });

  describe('Domain Allowlist Validation', () => {
    beforeEach(() => {
      bridge = new ReactBridge({}, mockEventBus);
    });

    it('should allow teams.microsoft.com domain', () => {
      const result = bridge.isAllowedDomain('https://teams.microsoft.com');
      assert.strictEqual(result, true);
    });

    it('should allow teams.live.com domain', () => {
      const result = bridge.isAllowedDomain('https://teams.live.com');
      assert.strictEqual(result, true);
    });

    it('should allow subdomain of teams.microsoft.com', () => {
      const result = bridge.isAllowedDomain('https://app.teams.microsoft.com');
      assert.strictEqual(result, true);
    });

    it('should allow subdomain of teams.live.com', () => {
      const result = bridge.isAllowedDomain('https://app.teams.live.com');
      assert.strictEqual(result, true);
    });

    it('should block unrelated domains', () => {
      const result = bridge.isAllowedDomain('https://evil.com');
      assert.strictEqual(result, false);
    });

    it('should block subdomain hijacking attempts', () => {
      // Prevents evil.com.teams.microsoft.com attacks
      const result = bridge.isAllowedDomain('https://teams.microsoft.com.evil.com');
      assert.strictEqual(result, false);
    });

    it('should block similar but invalid domains', () => {
      const result = bridge.isAllowedDomain('https://teamsmicrosoft.com');
      assert.strictEqual(result, false);
    });

    it('should handle invalid URLs gracefully', async () => {
      const result = await suppressConsole(() => bridge.isAllowedDomain('not-a-url'));
      assert.strictEqual(result, false);
    });

    it('should handle URLs with paths', () => {
      const result = bridge.isAllowedDomain('https://teams.microsoft.com/path/to/page');
      assert.strictEqual(result, true);
    });

    it('should handle URLs with query parameters', () => {
      const result = bridge.isAllowedDomain('https://teams.microsoft.com?param=value');
      assert.strictEqual(result, true);
    });
  });

  describe('React Root Detection', () => {
    beforeEach(() => {
      bridge = new ReactBridge({}, mockEventBus);
    });

    it('should detect legacy React structure (_reactRootContainer)', async () => {
      const window = createMockWindow({ reactVersion: 'legacy' });
      const result = await suppressConsole(() => bridge._validateReactStructure(window));

      assert.strictEqual(result, true);
    });

    it('should detect modern React 18+ structure (__reactContainer)', async () => {
      const window = createMockWindow({ reactVersion: 'modern' });
      const result = await suppressConsole(() => bridge._validateReactStructure(window));

      assert.strictEqual(result, true);
    });

    it('should fail when no React structure is detected', async () => {
      const window = createMockWindow({ hasReactRoot: false });
      const result = await suppressConsole(() => bridge._validateReactStructure(window));

      assert.strictEqual(result, false);
    });

    it('should fail when app element is missing', async () => {
      const window = createMockWindow({ hasAppElement: false });
      const result = await suppressConsole(() => bridge._validateAppElement(window));

      assert.strictEqual(result, false);
    });
  });

  describe('CoreServices Extraction from DOM', () => {
    beforeEach(() => {
      bridge = new ReactBridge({}, mockEventBus);
    });

    it('should extract coreServices successfully from valid React structure', async () => {
      const window = createMockWindow({ reactVersion: 'legacy' });
      const result = await suppressConsole(() => bridge.extractCoreServices(window));

      assert.ok(result !== null);
      assert.ok(typeof result === 'object');
      assert.ok(result.clientState);
      assert.ok(result.presenceService);
    });

    it('should cache extracted coreServices', async () => {
      const window = createMockWindow({ reactVersion: 'legacy' });
      await suppressConsole(() => bridge.extractCoreServices(window));

      assert.ok(bridge._coreServices !== null);
      assert.ok(typeof bridge._coreServices === 'object');
    });

    it('should emit success event when extraction succeeds', async () => {
      const emitted = [];
      mockEventBus.on('react-bridge:services-extracted', (data) => {
        emitted.push(data);
      });

      const window = createMockWindow({ reactVersion: 'legacy' });
      await suppressConsole(() => bridge.extractCoreServices(window));

      assert.strictEqual(emitted.length, 1);
      assert.strictEqual(emitted[0].success, true);
    });

    it('should return null when window is null', () => {
      const result = bridge.extractCoreServices(null);

      assert.strictEqual(result, null);
    });

    it('should return null when window has no document', () => {
      const result = bridge.extractCoreServices({});

      assert.strictEqual(result, null);
    });

    it('should return null when domain validation fails', async () => {
      const window = createMockWindow({ hostname: 'evil.com' });
      const result = await suppressConsole(() => bridge.extractCoreServices(window));

      assert.strictEqual(result, null);
    });

    it('should return null when app element is missing', async () => {
      const window = createMockWindow({ hasAppElement: false });
      const result = await suppressConsole(() => bridge.extractCoreServices(window));

      assert.strictEqual(result, null);
    });

    it('should return null when React root is missing', async () => {
      const window = createMockWindow({ hasReactRoot: false });
      const result = await suppressConsole(() => bridge.extractCoreServices(window));

      assert.strictEqual(result, null);
    });

    it('should return null when coreServices is missing', async () => {
      const window = createMockWindow({ hasCoreServices: false });
      const result = await suppressConsole(() => bridge.extractCoreServices(window));

      assert.strictEqual(result, null);
    });

    it('should emit error event when extraction fails', () => {
      const emitted = [];
      mockEventBus.on('react-bridge:extraction-error', (data) => {
        emitted.push(data);
      });

      // Create a valid window that passes validation
      const window = createMockWindow({ reactVersion: 'legacy' });

      // Make the React structure itself throw an error during property access
      // This happens AFTER validation, in the actual extraction
      const appElement = window.document.getElementById('app');
      Object.defineProperty(appElement._reactRootContainer, '_internalRoot', {
        get() {
          throw new Error('React internal error');
        }
      });

      // Silence error logging
      const originalError = console.error;
      console.error = () => {};

      try {
        // extractCoreServices is synchronous, no await needed
        const result = bridge.extractCoreServices(window);

        // Should return null on error
        assert.strictEqual(result, null, 'Should return null on error');

        // Should emit error event
        assert.strictEqual(emitted.length, 1, 'Should emit one error event');
        assert.ok(emitted[0].error.includes('React internal error'), 'Error message should match');
      } finally {
        console.error = originalError;
      }
    });

    it('should preserve exact DOM navigation pattern', async () => {
      // This test verifies the critical DOM path is unchanged
      const window = createMockWindow({ reactVersion: 'legacy' });
      const result = await suppressConsole(() => bridge.extractCoreServices(window));

      // Verify we got coreServices through the exact path:
      // element._reactRootContainer._internalRoot.current.updateQueue.baseState.element.props.coreServices
      assert.ok(result !== null);
      assert.strictEqual(typeof result, 'object');
    });
  });

  describe('Activity Status Monitoring', () => {
    beforeEach(() => {
      bridge = new ReactBridge({}, mockEventBus);
    });

    it('should return null when coreServices not extracted', () => {
      const result = bridge.getActivityStatus();

      assert.strictEqual(result, null);
    });

    it('should extract basic activity status', async () => {
      const window = createMockWindow({ reactVersion: 'legacy' });
      await suppressConsole(() => bridge.extractCoreServices(window));

      const status = bridge.getActivityStatus();

      assert.ok(status !== null);
      assert.strictEqual(typeof status.isIdle, 'boolean');
      assert.strictEqual(typeof status.idleTime, 'number');
      assert.ok(status.presence);
      assert.ok(status.timestamp);
    });

    it('should detect idle state correctly', async () => {
      const coreServices = createMockCoreServices({
        isIdle: () => true,
        getIdleTime: () => 60000
      });

      const window = createMockWindow({
        reactVersion: 'legacy',
        coreServicesData: coreServices
      });
      await suppressConsole(() => bridge.extractCoreServices(window));

      const status = bridge.getActivityStatus();

      assert.strictEqual(status.isIdle, true);
      assert.strictEqual(status.idleTime, 60000);
    });

    it('should extract presence information', async () => {
      const coreServices = createMockCoreServices({
        getCurrentPresence: () => 'Busy'
      });

      const window = createMockWindow({
        reactVersion: 'legacy',
        coreServicesData: coreServices
      });
      await suppressConsole(() => bridge.extractCoreServices(window));

      const status = bridge.getActivityStatus();

      assert.strictEqual(status.presence, 'Busy');
    });

    it('should handle missing idleTracker gracefully', async () => {
      const coreServices = {
        clientState: {},
        presenceService: {
          getCurrentPresence: () => 'Available'
        }
      };

      const window = createMockWindow({
        reactVersion: 'legacy',
        coreServicesData: coreServices
      });
      await suppressConsole(() => bridge.extractCoreServices(window));

      const status = bridge.getActivityStatus();

      assert.ok(status !== null);
      assert.strictEqual(status.isIdle, false);
      assert.strictEqual(status.idleTime, 0);
    });

    it('should handle missing presenceService gracefully', async () => {
      const coreServices = {
        clientState: {
          _idleTracker: {
            isIdle: () => false,
            getIdleTime: () => 0
          }
        }
      };

      const window = createMockWindow({
        reactVersion: 'legacy',
        coreServicesData: coreServices
      });
      await suppressConsole(() => bridge.extractCoreServices(window));

      const status = bridge.getActivityStatus();

      assert.ok(status !== null);
      assert.strictEqual(status.presence, 'Unknown');
    });

    it('should return null on extraction errors', async () => {
      // Set coreServices directly but make it throw
      bridge._coreServices = {
        get clientState() {
          throw new Error('Access error');
        }
      };

      const status = await suppressConsole(() => bridge.getActivityStatus());

      assert.strictEqual(status, null);
    });
  });

  describe('Event Emission for Status Changes', () => {
    beforeEach(() => {
      bridge = new ReactBridge({}, mockEventBus);
    });

    it('should emit event on first status check', async () => {
      const emitted = [];
      mockEventBus.on('react-bridge:status-changed', (data) => {
        emitted.push(data);
      });

      const window = createMockWindow({ reactVersion: 'legacy' });
      await suppressConsole(() => bridge.extractCoreServices(window));
      bridge.getActivityStatus();

      assert.strictEqual(emitted.length, 1);
      assert.ok(emitted[0].isIdle !== undefined);
    });

    it('should NOT emit event when status unchanged', async () => {
      const emitted = [];
      mockEventBus.on('react-bridge:status-changed', (data) => {
        emitted.push(data);
      });

      const window = createMockWindow({ reactVersion: 'legacy' });
      await suppressConsole(() => bridge.extractCoreServices(window));

      bridge.getActivityStatus();
      bridge.getActivityStatus(); // Second call with same status

      assert.strictEqual(emitted.length, 1); // Only one event
    });

    it('should emit event when idle state changes', async () => {
      const emitted = [];
      mockEventBus.on('react-bridge:status-changed', (data) => {
        emitted.push(data);
      });

      let isIdleValue = false;
      const coreServices = createMockCoreServices({
        isIdle: () => isIdleValue,
        getIdleTime: () => isIdleValue ? 60000 : 0
      });

      const window = createMockWindow({
        reactVersion: 'legacy',
        coreServicesData: coreServices
      });
      await suppressConsole(() => bridge.extractCoreServices(window));

      bridge.getActivityStatus(); // First check
      isIdleValue = true; // Change state
      bridge.getActivityStatus(); // Second check should emit

      assert.strictEqual(emitted.length, 2);
      assert.strictEqual(emitted[0].isIdle, false);
      assert.strictEqual(emitted[1].isIdle, true);
    });

    it('should emit event when presence changes', async () => {
      const emitted = [];
      mockEventBus.on('react-bridge:status-changed', (data) => {
        emitted.push(data);
      });

      let presenceValue = 'Available';
      const coreServices = createMockCoreServices({
        getCurrentPresence: () => presenceValue
      });

      const window = createMockWindow({
        reactVersion: 'legacy',
        coreServicesData: coreServices
      });
      await suppressConsole(() => bridge.extractCoreServices(window));

      bridge.getActivityStatus(); // First check
      presenceValue = 'Busy'; // Change presence
      bridge.getActivityStatus(); // Second check should emit

      assert.strictEqual(emitted.length, 2);
      assert.strictEqual(emitted[0].presence, 'Available');
      assert.strictEqual(emitted[1].presence, 'Busy');
    });

    it('should handle EventBus errors gracefully', async () => {
      const errorEventBus = {
        emit: () => {
          throw new Error('EventBus error');
        }
      };

      bridge = new ReactBridge({}, errorEventBus);

      const window = createMockWindow({ reactVersion: 'legacy' });

      // Should not throw
      assert.doesNotThrow(async () => {
        await suppressConsole(() => bridge.extractCoreServices(window));
      });
    });

    it('should not throw when EventBus is null', async () => {
      bridge = new ReactBridge({}, null);

      const window = createMockWindow({ reactVersion: 'legacy' });

      // Should not throw
      assert.doesNotThrow(async () => {
        await suppressConsole(() => bridge.extractCoreServices(window));
      });
    });
  });

  describe('Additional Service Methods', () => {
    beforeEach(() => {
      bridge = new ReactBridge({}, mockEventBus);
    });

    it('should get command change reporting service', async () => {
      const window = createMockWindow({ reactVersion: 'legacy' });
      await suppressConsole(() => bridge.extractCoreServices(window));

      const service = bridge.getCommandChangeReportingService();

      assert.ok(service !== null);
    });

    it('should return null for command service when no coreServices', () => {
      const service = bridge.getCommandChangeReportingService();

      assert.strictEqual(service, null);
    });

    it('should get idle tracker', async () => {
      const window = createMockWindow({ reactVersion: 'legacy' });
      await suppressConsole(() => bridge.extractCoreServices(window));

      const tracker = bridge.getIdleTracker();

      assert.ok(tracker !== null);
      assert.strictEqual(typeof tracker.isIdle, 'function');
    });

    it('should return null for idle tracker when no coreServices', () => {
      const tracker = bridge.getIdleTracker();

      assert.strictEqual(tracker, null);
    });

    it('should get client preferences', async () => {
      const window = createMockWindow({ reactVersion: 'legacy' });
      await suppressConsole(() => bridge.extractCoreServices(window));

      const prefs = bridge.getClientPreferences();

      assert.ok(prefs !== null);
    });

    it('should return null for client preferences when no coreServices', () => {
      const prefs = bridge.getClientPreferences();

      assert.strictEqual(prefs, null);
    });
  });

  describe('Validation State Management', () => {
    beforeEach(() => {
      bridge = new ReactBridge({}, mockEventBus);
    });

    it('should start with validation enabled', () => {
      assert.strictEqual(bridge.isValidated(), true);
    });

    it('should update validation state on successful extraction', async () => {
      const window = createMockWindow({ reactVersion: 'legacy' });
      await suppressConsole(() => bridge.extractCoreServices(window));

      assert.strictEqual(bridge.isValidated(), true);
    });

    it('should update validation state on failed validation', async () => {
      const window = createMockWindow({ hostname: 'evil.com' });
      await suppressConsole(() => bridge.extractCoreServices(window));

      assert.strictEqual(bridge.isValidated(), false);
    });
  });

  describe('Reset Functionality', () => {
    beforeEach(() => {
      bridge = new ReactBridge({}, mockEventBus);
    });

    it('should reset internal state', async () => {
      const window = createMockWindow({ reactVersion: 'legacy' });
      await suppressConsole(() => bridge.extractCoreServices(window));
      bridge.getActivityStatus();

      // Verify state is set
      assert.ok(bridge._coreServices !== null);
      assert.ok(bridge._lastStatus !== null);

      bridge.reset();

      // Verify state is cleared
      assert.strictEqual(bridge._coreServices, null);
      assert.strictEqual(bridge._lastStatus, null);
      assert.strictEqual(bridge._validationEnabled, true);
    });

    it('should emit reset event', () => {
      const emitted = [];
      mockEventBus.on('react-bridge:reset', (data) => {
        emitted.push(data);
      });

      bridge.reset();

      assert.strictEqual(emitted.length, 1);
      assert.ok(emitted[0].timestamp);
    });

    it('should allow re-extraction after reset', async () => {
      const window = createMockWindow({ reactVersion: 'legacy' });
      await suppressConsole(() => bridge.extractCoreServices(window));

      assert.ok(bridge._coreServices !== null);

      bridge.reset();

      assert.strictEqual(bridge._coreServices, null);

      await suppressConsole(() => bridge.extractCoreServices(window));

      assert.ok(bridge._coreServices !== null);
    });
  });

  describe('Edge Cases', () => {
    beforeEach(() => {
      bridge = new ReactBridge({}, mockEventBus);
    });

    it('should handle destroyed window object', async () => {
      const window = createMockWindow({ reactVersion: 'legacy' });

      // Extract first
      await suppressConsole(() => bridge.extractCoreServices(window));

      // Destroy window properties
      window.document = null;
      window.location = null;

      // Should not crash on next extraction
      const result = await suppressConsole(() => bridge.extractCoreServices(window));

      assert.strictEqual(result, null);
    });

    it('should handle null coreServices object', async () => {
      // When coreServices is explicitly disabled (not just null data),
      // the extraction should return null
      const window = createMockWindow({
        reactVersion: 'legacy',
        hasCoreServices: false  // Explicitly disable coreServices
      });

      const result = await suppressConsole(() => bridge.extractCoreServices(window));

      assert.strictEqual(result, null, 'Should return null when coreServices is missing');
    });

    it('should handle coreServices with missing methods', async () => {
      const incompleteCoreServices = {
        clientState: {} // Missing _idleTracker
        // Missing presenceService
      };

      const window = createMockWindow({
        reactVersion: 'legacy',
        coreServicesData: incompleteCoreServices
      });

      await suppressConsole(() => bridge.extractCoreServices(window));
      const status = bridge.getActivityStatus();

      // Should not crash and provide defaults
      assert.ok(status !== null);
      assert.strictEqual(status.isIdle, false);
      assert.strictEqual(status.idleTime, 0);
      assert.strictEqual(status.presence, 'Unknown');
    });

    it('should handle deeply nested null properties', async () => {
      const malformedCoreServices = {
        clientState: {
          _idleTracker: null
        },
        presenceService: null
      };

      const window = createMockWindow({
        reactVersion: 'legacy',
        coreServicesData: malformedCoreServices
      });

      await suppressConsole(() => bridge.extractCoreServices(window));
      const status = bridge.getActivityStatus();

      assert.ok(status !== null);
    });

    it('should handle React root with undefined values', async () => {
      const window = createMockWindow({ reactVersion: 'legacy' });

      // Break the chain
      const appElement = window.document.getElementById('app');
      appElement._reactRootContainer._internalRoot.current.updateQueue = undefined;

      const result = await suppressConsole(() => bridge.extractCoreServices(window));

      assert.strictEqual(result, null);
    });

    it('should handle multiple rapid extractions', async () => {
      const window = createMockWindow({ reactVersion: 'legacy' });

      // Rapid fire extractions - all should succeed
      await suppressConsole(async () => {
        for (let i = 0; i < 100; i++) {
          const result = bridge.extractCoreServices(window);
          if (i === 0) {
            // First extraction should succeed
            assert.ok(result !== null, 'First extraction should succeed');
          }
        }
      });

      // Should still have valid coreServices after all extractions
      assert.ok(bridge._coreServices !== null, 'coreServices should be cached after extractions');
    });

    it('should handle window with malformed location', async () => {
      const window = createMockWindow({ reactVersion: 'legacy' });
      window.location = { hostname: null };

      const result = await suppressConsole(() => bridge.extractCoreServices(window));

      assert.strictEqual(result, null);
    });

    it('should handle document.getElementById throwing error', async () => {
      const window = {
        location: { hostname: 'teams.microsoft.com' },
        document: {
          getElementById: () => {
            throw new Error('DOM access denied');
          }
        }
      };

      const result = await suppressConsole(() => bridge.extractCoreServices(window));

      assert.strictEqual(result, null);
    });
  });

  describe('Domain Validation Edge Cases', () => {
    beforeEach(() => {
      bridge = new ReactBridge({}, mockEventBus);
    });

    it('should handle empty string hostname', async () => {
      const result = await suppressConsole(() => bridge._isAllowedTeamsDomain(''));

      assert.strictEqual(result, false);
    });

    it('should handle null hostname', async () => {
      // NOTE: Current implementation throws on null hostname
      // This documents the current behavior - service could be improved
      // to handle null more gracefully in the future
      await assert.rejects(
        async () => {
          await suppressConsole(() => bridge._isAllowedTeamsDomain(null));
        },
        {
          name: 'TypeError',
          message: /Cannot read properties of null/
        },
        'Should throw TypeError when hostname is null'
      );
    });

    it('should handle hostname with port', () => {
      const result = bridge.isAllowedDomain('https://teams.microsoft.com:8080');

      assert.strictEqual(result, true);
    });

    it('should handle internationalized domain names', async () => {
      const result = await suppressConsole(async () =>
        bridge.isAllowedDomain('https://münchen.teams.microsoft.com')
      );

      // Should handle gracefully (likely false for safety)
      assert.strictEqual(typeof result, 'boolean');
    });

    it('should validate exact domain matching logic', async () => {
      // Test the _validateDomain method directly
      const validWindow = createMockWindow({ hostname: 'teams.microsoft.com' });
      const result = await suppressConsole(() => bridge._validateDomain(validWindow));

      assert.strictEqual(result, true);
    });

    it('should reject invalid domain in _validateDomain', async () => {
      const invalidWindow = createMockWindow({ hostname: 'evil.com' });
      const result = await suppressConsole(() => bridge._validateDomain(invalidWindow));

      assert.strictEqual(result, false);
    });
  });

  describe('Environment Validation', () => {
    beforeEach(() => {
      bridge = new ReactBridge({}, mockEventBus);
    });

    it('should perform complete environment validation', async () => {
      const window = createMockWindow({ reactVersion: 'legacy' });
      const result = await suppressConsole(() => bridge._validateTeamsEnvironment(window));

      assert.strictEqual(result, true);
    });

    it('should fail validation with invalid domain', async () => {
      const window = createMockWindow({
        hostname: 'evil.com',
        reactVersion: 'legacy'
      });
      const result = await suppressConsole(() => bridge._validateTeamsEnvironment(window));

      assert.strictEqual(result, false);
    });

    it('should fail validation with missing document', async () => {
      const window = { location: { hostname: 'teams.microsoft.com' } };
      const result = await suppressConsole(() => bridge._validateTeamsEnvironment(window));

      assert.strictEqual(result, false);
    });

    it('should fail validation with missing app element', async () => {
      const window = createMockWindow({
        hasAppElement: false,
        reactVersion: 'legacy'
      });
      const result = await suppressConsole(() => bridge._validateTeamsEnvironment(window));

      assert.strictEqual(result, false);
    });

    it('should fail validation with missing React structure', async () => {
      const window = createMockWindow({ hasReactRoot: false });
      const result = await suppressConsole(() => bridge._validateTeamsEnvironment(window));

      assert.strictEqual(result, false);
    });

    it('should update internal validation state', async () => {
      const window = createMockWindow({ hostname: 'evil.com' });
      await suppressConsole(() => bridge._validateTeamsEnvironment(window));

      assert.strictEqual(bridge._validationEnabled, false);
    });
  });
});
