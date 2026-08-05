import { Response, NextFunction, RequestHandler } from 'express';
import { AuthenticatedRequest } from '../../http/types';
import { hasPermission, hasAnyPermission, hasAllPermissions } from '../permissions';
import { ApiError } from '../../errors/ApiError';

export const checkPermission = (required: string): RequestHandler => {
  return (req, _res, next: NextFunction): void => {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user?._id) return next(ApiError.unauthorized('Authentication required'));
    
    if (authReq.user.isOwner || authReq.user.isSuperAdmin) return next();
    
    if (!hasPermission(authReq.user.permissions as string[], required)) {
      return next(ApiError.forbidden(`You don't have permission to: ${required}`));
    }
    next();
  };
};

export const checkAnyPermission = (required: string[]): RequestHandler => {
  return (req, _res, next: NextFunction): void => {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user?._id) return next(ApiError.unauthorized('Authentication required'));
    
    if (authReq.user.isOwner || authReq.user.isSuperAdmin) return next();
    
    if (!hasAnyPermission(authReq.user.permissions as string[], required)) {
      return next(ApiError.forbidden('Insufficient permissions'));
    }
    next();
  };
};

export const checkAllPermissions = (required: string[]): RequestHandler => {
  return (req, _res, next: NextFunction): void => {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user?._id) return next(ApiError.unauthorized('Authentication required'));
    
    if (authReq.user.isOwner || authReq.user.isSuperAdmin) return next();
    
    if (!hasAllPermissions(authReq.user.permissions as string[], required)) {
      return next(ApiError.forbidden('Missing required permissions'));
    }
    next();
  };
};