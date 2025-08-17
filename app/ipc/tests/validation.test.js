/**
 * IPC Validation Tests
 * 
 * Tests the validation system for critical IPC handlers.
 */

const { IPCValidator, getValidator, validate, wrapHandler } = require('../validation');

describe('IPC Validation System', () => {
  let validator;

  beforeEach(() => {
    validator = new IPCValidator();
  });

  describe('Configuration Validation', () => {
    test('validates safe config key format', () => {
      const result = validator.validate('get-config', { key: 'app.theme' });
      expect(result.valid).toBe(true);
      expect(result.data.key).toBe('app.theme');
    });

    test('rejects unsafe config key with special characters', () => {
      const result = validator.validate('get-config', { key: '../../../etc/passwd' });
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ message: expect.stringContaining('pattern') })
      );
    });

    test('validates config value types and sizes', () => {
      const validConfig = {
        key: 'user.preferences',
        value: { theme: 'dark', notifications: true },
        persistent: true
      };
      
      const result = validator.validate('set-config', validConfig);
      expect(result.valid).toBe(true);
      expect(result.data.persistent).toBe(true);
    });

    test('rejects oversized config values', () => {
      const oversizedConfig = {
        key: 'test.key',
        value: 'x'.repeat(1001) // Exceeds 1000 char limit
      };
      
      const result = validator.validate('set-config', oversizedConfig);
      expect(result.valid).toBe(false);
    });
  });

  describe('Authentication Validation', () => {
    test('validates SSO login with safe parameters', () => {
      const ssoData = {
        provider: 'microsoft',
        redirectUrl: 'https://login.microsoftonline.com/callback',
        state: 'secure-state-123'
      };
      
      const result = validator.validate('sso-login', ssoData);
      expect(result.valid).toBe(true);
      expect(result.data.provider).toBe('microsoft');
    });

    test('rejects non-HTTPS redirect URLs', () => {
      const unsafeSSO = {
        provider: 'microsoft',
        redirectUrl: 'http://malicious-site.com/steal-tokens'
      };
      
      const result = validator.validate('sso-login', unsafeSSO);
      expect(result.valid).toBe(false);
    });

    test('rejects invalid authentication providers', () => {
      const invalidProvider = {
        provider: 'malicious-provider'
      };
      
      const result = validator.validate('sso-login', invalidProvider);
      expect(result.valid).toBe(false);
    });
  });

  describe('Screen Sharing Validation', () => {
    test('validates screen capturer sources request', () => {
      const sourcesRequest = {
        types: ['screen', 'window'],
        thumbnailSize: { width: 150, height: 150 },
        fetchWindowIcons: false
      };
      
      const result = validator.validate('desktop-capturer-get-sources', sourcesRequest);
      expect(result.valid).toBe(true);
      expect(result.data.types).toEqual(['screen', 'window']);
    });

    test('rejects oversized thumbnail requests', () => {
      const oversizedRequest = {
        types: ['screen'],
        thumbnailSize: { width: 1000, height: 1000 } // Exceeds 500px limit
      };
      
      const result = validator.validate('desktop-capturer-get-sources', oversizedRequest);
      expect(result.valid).toBe(false);
    });

    test('rejects invalid source types', () => {
      const invalidTypes = {
        types: ['screen', 'malicious-type']
      };
      
      const result = validator.validate('desktop-capturer-get-sources', invalidTypes);
      expect(result.valid).toBe(false);
    });
  });

  describe('File System Validation', () => {
    test('validates safe file operations', () => {
      const fileData = {
        filename: 'user-config.json',
        data: '{"theme": "dark"}',
        encoding: 'utf8'
      };
      
      const result = validator.validate('save-file', fileData);
      expect(result.valid).toBe(true);
      expect(result.data.encoding).toBe('utf8');
    });

    test('rejects path traversal attempts in filename', () => {
      const maliciousFile = {
        filename: '../../../etc/passwd',
        data: 'malicious content'
      };
      
      const result = validator.validate('save-file', maliciousFile);
      expect(result.valid).toBe(false);
    });

    test('rejects oversized file data', () => {
      const oversizedFile = {
        filename: 'large-file.txt',
        data: 'x'.repeat(10485761) // Exceeds 10MB limit
      };
      
      const result = validator.validate('save-file', oversizedFile);
      expect(result.valid).toBe(false);
    });
  });

  describe('Handler Wrapping', () => {
    test('wraps handler with validation', async () => {
      const mockHandler = jest.fn().mockResolvedValue({ success: true });
      const wrappedHandler = validator.wrapHandler('get-config', mockHandler);
      
      const result = await wrappedHandler({}, { key: 'app.theme' });
      
      expect(mockHandler).toHaveBeenCalledWith({}, { key: 'app.theme' });
      expect(result).toEqual({ success: true });
    });

    test('prevents invalid data from reaching handler', async () => {
      const mockHandler = jest.fn().mockResolvedValue({ success: true });
      const wrappedHandler = validator.wrapHandler('get-config', mockHandler);
      
      await expect(wrappedHandler({}, { key: '../etc/passwd' }))
        .rejects.toThrow('Validation failed');
      
      expect(mockHandler).not.toHaveBeenCalled();
    });

    test('sanitizes data before passing to handler', async () => {
      const mockHandler = jest.fn().mockResolvedValue({ success: true });
      const wrappedHandler = validator.wrapHandler('set-config', mockHandler);
      
      const inputData = {
        key: 'user.setting',
        value: 'test',
        persistent: true,
        maliciousField: 'should be removed' // Should be stripped
      };
      
      await wrappedHandler({}, inputData);
      
      const sanitizedData = mockHandler.mock.calls[0][1];
      expect(sanitizedData).not.toHaveProperty('maliciousField');
      expect(sanitizedData.key).toBe('user.setting');
    });
  });

  describe('Schema Management', () => {
    test('registers custom schema', () => {
      const customSchema = {
        type: 'object',
        properties: {
          customField: { type: 'string' }
        },
        required: ['customField']
      };
      
      validator.registerSchema('custom-channel', customSchema);
      expect(validator.hasValidation('custom-channel')).toBe(true);
    });

    test('removes schema', () => {
      validator.registerSchema('temp-channel', { type: 'object' });
      expect(validator.hasValidation('temp-channel')).toBe(true);
      
      const removed = validator.removeSchema('temp-channel');
      expect(removed).toBe(true);
      expect(validator.hasValidation('temp-channel')).toBe(false);
    });

    test('provides validation statistics', () => {
      const stats = validator.getStats();
      expect(stats).toHaveProperty('enabled');
      expect(stats).toHaveProperty('registeredSchemas');
      expect(stats).toHaveProperty('schemas');
      expect(Array.isArray(stats.schemas)).toBe(true);
    });
  });

  describe('Singleton Access', () => {
    test('getValidator returns same instance', () => {
      const validator1 = getValidator();
      const validator2 = getValidator();
      expect(validator1).toBe(validator2);
    });

    test('convenience functions work', () => {
      const result = validate('get-config', { key: 'test.key' });
      expect(result.valid).toBe(true);
    });
  });

  describe('Validation Toggle', () => {
    test('can disable validation', () => {
      validator.setValidationEnabled(false);
      
      // Should pass even with invalid data when disabled
      const result = validator.validate('get-config', { key: '../etc/passwd' });
      expect(result.valid).toBe(true);
    });

    test('can re-enable validation', () => {
      validator.setValidationEnabled(false);
      validator.setValidationEnabled(true);
      
      const result = validator.validate('get-config', { key: '../etc/passwd' });
      expect(result.valid).toBe(false);
    });
  });
});

// Integration test helpers
describe('Validation Integration Helpers', () => {
  test('handles non-existent schema gracefully', () => {
    const result = validate('unknown-channel', { anything: 'goes' });
    expect(result.valid).toBe(true); // No validation = pass through
  });

  test('handles malformed data gracefully', () => {
    const result = validate('get-config', null);
    expect(result.valid).toBe(false);
  });

  test('provides detailed error information', () => {
    const result = validate('get-config', { key: '', invalidField: 'value' });
    expect(result.valid).toBe(false);
    expect(result.errors).toBeDefined();
    expect(Array.isArray(result.errors)).toBe(true);
  });
});