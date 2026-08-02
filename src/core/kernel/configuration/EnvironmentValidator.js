'use strict';

const { InfrastructureError } = require('../errors');

/**
 * Validates the environment variables on application startup.
 * Fails fast if required configuration is missing.
 */
class EnvironmentValidator {
  /**
   * @param {Object} schema - Key-value pair of ENV variable names and their options
   * Example: { 'MONGO_URI': { required: true }, 'PORT': { required: false, default: 3000 } }
   */
  static validate(schema) {
    const config = {};
    const missing = [];

    for (const [key, options] of Object.entries(schema)) {
      const value = process.env[key];

      if (value === undefined || value === '') {
        if (options.required) {
          missing.push(key);
        } else {
          config[key] = options.default;
        }
      } else {
        // Simple type coercion based on expected type (if provided)
        if (options.type === 'number') {
          const parsed = Number(value);
          if (isNaN(parsed)) throw new InfrastructureError(`Environment variable ${key} must be a number.`);
          config[key] = parsed;
        } else if (options.type === 'boolean') {
          config[key] = value === 'true' || value === '1';
        } else {
          config[key] = value;
        }
      }
    }

    if (missing.length > 0) {
      throw new InfrastructureError(
        `Missing required environment variables: ${missing.join(', ')}.\n` +
        `Application startup aborted. Ensure these are set in your deployment environment.`
      );
    }

    return config;
  }
}

module.exports = EnvironmentValidator;
