/**
 * Base class for all operational errors in the Platform OS.
 * Operational errors represent problems that can be anticipated and handled
 * gracefully (e.g., invalid user input, network failure, not found).
 */
export class AppError extends Error {
    public readonly statusCode: number;
    public readonly errorCode: string;
    public readonly isOperational: boolean;
  
    constructor(message: string, statusCode = 500, errorCode = 'INTERNAL_ERROR', isOperational = true) {
      super(message);
      this.name = this.constructor.name;
      this.statusCode = statusCode;
      this.errorCode = errorCode;
      this.isOperational = isOperational;
  
      if (Error.captureStackTrace) {
        Error.captureStackTrace(this, this.constructor);
      }
    }
  }
  
  /**
   * Thrown when a business rule or invariant is violated within the domain layer.
   */
  export class DomainError extends AppError {
    constructor(message: string, errorCode = 'DOMAIN_RULE_VIOLATION') {
      super(message, 422, errorCode, true);
    }
  }
  
  /**
   * Thrown when a requested resource cannot be found.
   */
  export class NotFoundError extends AppError {
    constructor(resource: string, identifier: string) {
      super(`${resource} with identifier ${identifier} was not found.`, 404, 'NOT_FOUND', true);
    }
  }
  
  /**
   * Thrown when an infrastructure component fails (e.g., Database down, API timeout).
   */
  export class InfrastructureError extends AppError {
    constructor(message: string, errorCode = 'INFRASTRUCTURE_FAILURE') {
      super(message, 503, errorCode, true);
    }
  }
  
  /**
   * Thrown when the caller does not have permission to perform an action.
   */
  export class UnauthorizedError extends AppError {
    constructor(message = 'Unauthorized access', errorCode = 'UNAUTHORIZED') {
      super(message, 401, errorCode, true);
    }
  }
  
  export class ForbiddenError extends AppError {
    constructor(message = 'Access to this resource is forbidden', errorCode = 'FORBIDDEN') {
      super(message, 403, errorCode, true);
    }
  }