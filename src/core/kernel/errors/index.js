'use strict';

/**
 * Base class for all operational errors in the Platform OS.
 * Operational errors represent problems that can be anticipated and handled
 * gracefully (e.g. invalid user input, network failure, not found).
 */
class AppError extends Error {
  /**
   * @param {string} message - Human readable error message
   * @param {number} statusCode - HTTP equivalent status code
   * @param {string} errorCode - Machine readable error code (e.g. 'RESOURCE_NOT_FOUND')
   * @param {boolean} isOperational - Whether this is a trusted, anticipated error
   */
  constructor(message, statusCode = 500, errorCode = 'INTERNAL_ERROR', isOperational = true) {
    super(message);

    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.isOperational = isOperational;
    
    // Maintain proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Thrown when a business rule or invariant is violated within the domain layer.
 */
class DomainError extends AppError {
  constructor(message, errorCode = 'DOMAIN_RULE_VIOLATION') {
    super(message, 422, errorCode, true);
  }
}

/**
 * Thrown when a requested resource cannot be found.
 */
class NotFoundError extends AppError {
  constructor(resource, identifier) {
    super(`${resource} with identifier ${identifier} was not found.`, 404, 'NOT_FOUND', true);
  }
}

/**
 * Thrown when an infrastructure component fails (e.g. Database down, API timeout).
 */
class InfrastructureError extends AppError {
  constructor(message, errorCode = 'INFRASTRUCTURE_FAILURE') {
    super(message, 503, errorCode, true);
  }
}

/**
 * Thrown when the caller does not have permission to perform an action.
 */
class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized access', errorCode = 'UNAUTHORIZED') {
    super(message, 401, errorCode, true);
  }
}

class ForbiddenError extends AppError {
  constructor(message = 'Access to this resource is forbidden', errorCode = 'FORBIDDEN') {
    super(message, 403, errorCode, true);
  }
}

module.exports = {
  AppError,
  DomainError,
  NotFoundError,
  InfrastructureError,
  UnauthorizedError,
  ForbiddenError
};
