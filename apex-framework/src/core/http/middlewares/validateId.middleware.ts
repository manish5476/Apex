import { Request, Response, NextFunction, RequestHandler } from 'express';
import mongoose from 'mongoose';
import { ApiError } from '../../errors/ApiError';

/**
 * Middleware to validate that specific parameters are valid MongoDB ObjectIds.
 */
export const validateIds = (...paramNames: string[]): RequestHandler => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    for (const name of paramNames) {
      const id = req.params[name];
      if (id && !mongoose.Types.ObjectId.isValid(id)) {
        return next(ApiError.badRequest(`Invalid ${name} format: ${id}`));
      }
    }
    next();
  };
};