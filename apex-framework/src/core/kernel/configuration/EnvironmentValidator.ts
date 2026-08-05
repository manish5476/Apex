import { InfrastructureError } from '../errors';

export interface EnvSchemaOptions {
  required?: boolean;
  default?: string | number | boolean;
  type?: 'string' | 'number' | 'boolean';
}

export type EnvSchema = Record<string, EnvSchemaOptions>;
export type ValidatedConfig = Record<string, string | number | boolean | undefined>;

/**
 * Validates the environment variables on application startup.
 * Fails fast if required configuration is missing.
 */
export class EnvironmentValidator {
  public static validate(schema: EnvSchema): ValidatedConfig {
    const config: ValidatedConfig = {};
    const missing: string[] = [];

    for (const [key, options] of Object.entries(schema)) {
      const value = process.env[key];

      if (value === undefined || value === '') {
        if (options.required) {
          missing.push(key);
        } else {
          config[key] = options.default;
        }
      } else {
        if (options.type === 'number') {
          const parsed = Number(value);
          if (isNaN(parsed)) {
            throw new InfrastructureError(`Environment variable ${key} must be a number.`);
          }
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