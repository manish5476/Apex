export enum HttpStatus {
    BAD_REQUEST = 400,
    UNAUTHORIZED = 401,
    FORBIDDEN = 403,
    NOT_FOUND = 404,
    CONFLICT = 409,
    INTERNAL_SERVER_ERROR = 500,
  }
  
  /**
   * Standard application error. Thrown from anywhere in the app (controllers,
   * services, repositories) and caught by the global `errorHandler` middleware.
   *
   * `isOperational: true` marks this as an "expected" error (bad input, not
   * found, etc.) as opposed to a genuine bug/crash, so the error handler can
   * decide whether to log it as noise or as something to investigate.
   */
  export class ApiError extends Error {
    public readonly statusCode: HttpStatus;
    public readonly details: unknown;
    public readonly isOperational: boolean = true;
  
    constructor(statusCode: HttpStatus, message: string, details: unknown = null) {
      super(message);
      this.name = 'ApiError';
      this.statusCode = statusCode;
      this.details = details;
      Error.captureStackTrace(this, this.constructor);
    }
  
    static badRequest(message: string, details?: unknown): ApiError {
      return new ApiError(HttpStatus.BAD_REQUEST, message, details);
    }
  
    static unauthorized(message = 'Unauthorized'): ApiError {
      return new ApiError(HttpStatus.UNAUTHORIZED, message);
    }
  
    static forbidden(message = 'Forbidden'): ApiError {
      return new ApiError(HttpStatus.FORBIDDEN, message);
    }
  
    static notFound(message = 'Not found'): ApiError {
      return new ApiError(HttpStatus.NOT_FOUND, message);
    }
  
    static conflict(message: string): ApiError {
      return new ApiError(HttpStatus.CONFLICT, message);
    }
  
    static internal(message = 'Internal server error'): ApiError {
      return new ApiError(HttpStatus.INTERNAL_SERVER_ERROR, message);
    }
  }