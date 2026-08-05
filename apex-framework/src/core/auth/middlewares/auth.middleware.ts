import { Response, NextFunction, RequestHandler } from 'express';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { AuthenticatedRequest } from '../../http/types';
import { ApiError } from '../../errors/ApiError';

// Note: In strict DDD, these should be replaced with an AuthService call,
// but mapping directly to your Mongoose models to preserve exact functionality.
import User from '@modules/iam/infrastructure/models/user.model';
import Organization from '@modules/organization/infrastructure/models/organization.model';

interface DecodedToken extends JwtPayload {
  id: string;
  type?: string;
}

const getJwtSecret = (): string => {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET is required in production');
  }
  return 'change_this_secret';
};

export const protect: RequestHandler = async (req, res, next): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;
    
    const token = authReq.headers.authorization?.startsWith('Bearer ')
      ? authReq.headers.authorization.split(' ')[1]
      : authReq.cookies?.jwt;

    if (!token) {
      next(ApiError.unauthorized('You are not logged in'));
      return;
    }

    const decoded = await new Promise<DecodedToken>((resolve, reject) => {
      jwt.verify(token, getJwtSecret(), (err, payload) => {
        err ? reject(err) : resolve(payload as DecodedToken);
      });
    });

    if (decoded.type && decoded.type !== 'merchant_user') {
      next(ApiError.forbidden('Invalid token type for merchant API'));
      return;
    }

    const [currentUser, ownerOrg] = await Promise.all([
      User.findById(decoded.id).populate({
        path: 'role',
        select: 'permissions name isSuperAdmin',
      }),
      Organization.findOne({ owner: decoded.id }).select('_id').lean(),
    ]);

    if (!currentUser) {
      next(ApiError.unauthorized('User no longer exists'));
      return;
    }

    if (typeof currentUser.changedPasswordAfter === 'function' && currentUser.changedPasswordAfter(decoded.iat || 0)) {
      next(ApiError.unauthorized('Password recently changed. Please log in again'));
      return;
    }

    const isOwner = !!ownerOrg;

    authReq.user = {
      _id: currentUser._id as any,
      id: currentUser._id.toString(),
      email: currentUser.email,
      name: currentUser.name,
      organizationId: currentUser.organizationId as any,
      branchId: currentUser.branchId as any,
      role: currentUser.role?._id as any,
      roleName: currentUser.role?.name,
      isOwner,
      isSuperAdmin: isOwner || currentUser.role?.isSuperAdmin || false,
      permissions: isOwner ? ['*'] : (currentUser.role?.permissions ?? []),
    };

    authReq.userDoc = currentUser;

    next();
  } catch (err) {
    const error = err as Error;
    if (error.name === 'TokenExpiredError') {
      res.status(401).json({ status: 'fail', message: 'jwt expired', code: 'TOKEN_EXPIRED' });
      return;
    }
    next(ApiError.unauthorized('Invalid token'));
  }
};

export const restrictToOwner: RequestHandler = (req, _res, next): void => {
  const authReq = req as AuthenticatedRequest;
  if (!authReq.user?.isOwner) {
    next(ApiError.forbidden('Only organization owners can do this'));
    return;
  }
  next();
};

export const restrictToSuperAdmin: RequestHandler = (req, _res, next): void => {
  const authReq = req as AuthenticatedRequest;
  if (!authReq.user?.isOwner && !authReq.user?.isSuperAdmin) {
    next(ApiError.forbidden('Only super administrators can do this'));
    return;
  }
  next();
};