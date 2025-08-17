/**
 * IPC Validation Utility
 * 
 * Provides simple JSON schema validation for security-critical IPC events.
 * Uses AJV for lightweight validation without external dependencies.
 */

const Ajv = require('ajv');
const addFormats = require('ajv-formats');

class IPCValidator {
  constructor() {
    this.ajv = new Ajv({ 
      allErrors: true,
      removeAdditional: true, // Remove unknown properties for security
      useDefaults: true,      // Apply default values from schema
      strictTypes: false      // Allow union types for flexibility
    });
    
    // Add format validation for URLs, etc.
    addFormats(this.ajv);
    
    this.schemas = new Map();
    this.validationEnabled = true;
    
    console.info('[IPC-Validator] Initializing validation system');
    this.registerCriticalSchemas();
  }

  /**
   * Register validation schemas for security-critical IPC events
   */
  registerCriticalSchemas() {
    // Configuration handlers - prevent malicious config injection
    this.registerSchema('get-config', {
      type: 'object',
      properties: {
        key: { 
          type: 'string', 
          pattern: '^[a-zA-Z0-9_.-]+$', // Safe config key format
          maxLength: 100 
        },
        section: { 
          type: 'string', 
          pattern: '^[a-zA-Z0-9_.-]+$',
          maxLength: 50 
        }
      },
      required: ['key'],
      additionalProperties: false
    });

    this.registerSchema('set-config', {
      type: 'object',
      properties: {
        key: { 
          type: 'string', 
          pattern: '^[a-zA-Z0-9_.-]+$',
          maxLength: 100 
        },
        value: {
          // Allow various types but with size limits
          oneOf: [
            { type: 'string', maxLength: 1000 },
            { type: 'number' },
            { type: 'boolean' },
            { 
              type: 'object', 
              maxProperties: 20,
              additionalProperties: {
                type: ['string', 'number', 'boolean'],
                maxLength: 500
              }
            }
          ]
        },
        persistent: { type: 'boolean', default: true }
      },
      required: ['key', 'value'],
      additionalProperties: false
    });

    // Authentication handlers - validate auth-related events
    this.registerSchema('sso-login', {
      type: 'object',
      properties: {
        provider: { 
          type: 'string', 
          enum: ['microsoft', 'azure', 'office365'],
          maxLength: 20
        },
        redirectUrl: { 
          type: 'string', 
          format: 'uri',
          pattern: '^https://',  // Only HTTPS URLs for security
          maxLength: 500
        },
        state: { 
          type: 'string', 
          pattern: '^[a-zA-Z0-9_.-]+$',
          maxLength: 100 
        }
      },
      required: ['provider'],
      additionalProperties: false
    });

    // Screen sharing handlers - prevent unauthorized screen access
    this.registerSchema('desktop-capturer-get-sources', {
      type: 'object',
      properties: {
        types: {
          type: 'array',
          items: { 
            type: 'string', 
            enum: ['screen', 'window'] 
          },
          maxItems: 2,
          minItems: 1
        },
        thumbnailSize: {
          type: 'object',
          properties: {
            width: { type: 'number', minimum: 50, maximum: 500 },
            height: { type: 'number', minimum: 50, maximum: 500 }
          },
          additionalProperties: false
        },
        fetchWindowIcons: { type: 'boolean', default: false }
      },
      required: ['types'],
      additionalProperties: false
    });

    // File system operations - validate file paths for security
    this.registerSchema('save-file', {
      type: 'object',
      properties: {
        filename: { 
          type: 'string',
          pattern: '^[a-zA-Z0-9_.-]+\\.[a-zA-Z0-9]+$', // Safe filename pattern
          maxLength: 255
        },
        data: { 
          type: 'string',
          maxLength: 10485760 // 10MB limit
        },
        encoding: { 
          type: 'string', 
          enum: ['utf8', 'base64', 'binary'],
          default: 'utf8'
        }
      },
      required: ['filename', 'data'],
      additionalProperties: false
    });

    console.info(`[IPC-Validator] Registered ${this.schemas.size} critical validation schemas`);
  }

  /**
   * Register a validation schema for an IPC channel
   */
  registerSchema(channel, schema) {
    try {
      const validate = this.ajv.compile(schema);
      this.schemas.set(channel, validate);
      console.debug(`[IPC-Validator] Registered schema for channel: ${channel}`);
    } catch (error) {
      console.error(`[IPC-Validator] Failed to compile schema for ${channel}:`, error);
    }
  }

  /**
   * Validate IPC event data against registered schema
   */
  validate(channel, data) {
    if (!this.validationEnabled) {
      return { valid: true, data };
    }

    const validator = this.schemas.get(channel);
    if (!validator) {
      // No schema registered = no validation required
      return { valid: true, data };
    }

    try {
      // Clone data to avoid modifying original
      const clonedData = JSON.parse(JSON.stringify(data));
      const valid = validator(clonedData);
      
      if (valid) {
        console.debug(`[IPC-Validator] ✅ Validation passed for ${channel}`);
        return { valid: true, data: clonedData }; // Return sanitized data
      } else {
        const errors = validator.errors || [];
        console.warn(`[IPC-Validator] ❌ Validation failed for ${channel}:`, errors);
        return { 
          valid: false, 
          errors: errors.map(err => ({
            field: err.instancePath || err.schemaPath,
            message: err.message,
            value: err.data
          }))
        };
      }
    } catch (error) {
      console.error(`[IPC-Validator] Validation error for ${channel}:`, error);
      return { 
        valid: false, 
        errors: [{ message: 'Validation process failed', error: error.message }]
      };
    }
  }

  /**
   * Create a validation wrapper for IPC handlers
   */
  wrapHandler(channel, handler) {
    const validator = this.schemas.get(channel);
    if (!validator || !this.validationEnabled) {
      return handler; // No validation needed
    }

    return async (event, ...args) => {
      // Validate input parameters
      const inputData = args.length === 1 ? args[0] : args;
      const validation = this.validate(channel, inputData);
      
      if (!validation.valid) {
        const error = new Error(`Validation failed for ${channel}`);
        error.validationErrors = validation.errors;
        console.error(`[IPC-Validator] Rejecting invalid request to ${channel}:`, validation.errors);
        throw error;
      }

      // Call original handler with sanitized data
      try {
        if (args.length === 1) {
          return await handler(event, validation.data);
        } else {
          return await handler(event, ...validation.data);
        }
      } catch (error) {
        // Don't wrap handler errors, just re-throw
        throw error;
      }
    };
  }

  /**
   * Enable or disable validation system
   */
  setValidationEnabled(enabled) {
    this.validationEnabled = enabled;
    console.info(`[IPC-Validator] Validation ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Get validation statistics
   */
  getStats() {
    return {
      enabled: this.validationEnabled,
      registeredSchemas: this.schemas.size,
      schemas: Array.from(this.schemas.keys())
    };
  }

  /**
   * Check if a channel has validation
   */
  hasValidation(channel) {
    return this.schemas.has(channel);
  }

  /**
   * Remove validation schema for a channel
   */
  removeSchema(channel) {
    const removed = this.schemas.delete(channel);
    if (removed) {
      console.debug(`[IPC-Validator] Removed schema for channel: ${channel}`);
    }
    return removed;
  }
}

// Singleton instance
let validatorInstance = null;

/**
 * Get the global validator instance
 */
function getValidator() {
  if (!validatorInstance) {
    validatorInstance = new IPCValidator();
  }
  return validatorInstance;
}

module.exports = {
  IPCValidator,
  getValidator,
  
  // Convenience functions
  validate: (channel, data) => getValidator().validate(channel, data),
  wrapHandler: (channel, handler) => getValidator().wrapHandler(channel, handler),
  registerSchema: (channel, schema) => getValidator().registerSchema(channel, schema),
  setValidationEnabled: (enabled) => getValidator().setValidationEnabled(enabled),
  getStats: () => getValidator().getStats()
};