import { ErrorRequestHandler, NextFunction, Request, RequestHandler, Response } from 'express';
import mongoose from 'mongoose';
import { ApiError } from './ApiError';

/** Thrown by the MongoDB driver on a unique-index violation (E11000). */
interface MongoDuplicateKeyError extends Error {
  code: number;
}

function isMongoDuplicateKeyError(err: unknown): err is MongoDuplicateKeyError {
  return typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000;
}

export const notFoundHandler: RequestHandler = (req: Request, _res: Response, next: NextFunction): void => {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
};

export const errorHandler: ErrorRequestHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  let error: ApiError;

  // Convert known Mongoose errors into clean ApiErrors
  if (err instanceof mongoose.Error.ValidationError) {
    error = ApiError.badRequest('Validation failed', err.errors);
  } else if (err instanceof mongoose.Error.CastError) {
    error = ApiError.badRequest(`Invalid ${err.path}: ${String(err.value)}`);
  } else if (isMongoDuplicateKeyError(err)) {
    error = ApiError.conflict('Duplicate value violates a unique constraint');
  } else if (err instanceof ApiError) {
    error = err;
  } else {
    error = ApiError.internal(
      process.env.NODE_ENV === 'production' ? 'Something went wrong' : err.message
    );
  }

  if (!error.isOperational) {
    console.error('[unexpected error]', err);
  }

  res.status(error.statusCode).json({
    success: false,
    message: error.message,
    details: error.details ?? undefined,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });
};