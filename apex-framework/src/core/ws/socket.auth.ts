import { Socket } from 'socket.io';
import jwt, { JwtPayload } from 'jsonwebtoken';
import User from '@modules/iam/infrastructure/models/user.model';
import { AuthenticatedSocket } from './socket.types';
import logger from '../logger';

const ADMIN_ROLES = new Set(['admin', 'superadmin', 'owner']);

export const socketAuthMiddleware = async (socket: Socket, next: (err?: Error) => void) => {
  const customSocket = socket as AuthenticatedSocket;
  logger.debug(`🔍 Socket handshake attempt (Socket ID: ${socket.id})`);

  try {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token || socket.handshake.headers?.authorization?.split(' ')[1];
    
    if (!token) {
      logger.warn(`⚠️ Socket connection rejected: No token provided (Socket ID: ${socket.id})`);
      return next(Object.assign(new Error('AUTH_REQUIRED'), { data: { code: 'AUTH_REQUIRED' } }));
    }

    const secret = process.env.JWT_SECRET || 'change_this_secret';
    let payload: JwtPayload;

    try {
      payload = jwt.verify(token, secret) as JwtPayload;
    } catch (err) {
      if ((err as Error).name === 'TokenExpiredError') {
        return next(Object.assign(new Error('TOKEN_EXPIRED'), { data: { code: 'TOKEN_EXPIRED' } }));
      }
      return next(Object.assign(new Error('INVALID_TOKEN'), { data: { code: 'INVALID_TOKEN' } }));
    }

    const userId = payload.sub || payload.id;
    if (!userId || !payload.organizationId) {
      return next(Object.assign(new Error('INVALID_PAYLOAD'), { data: { code: 'INVALID_PAYLOAD' } }));
    }

    const user = await User.findById(userId).select('_id name email organizationId role isActive').lean();

    if (!user) return next(Object.assign(new Error('USER_NOT_FOUND'), { data: { code: 'USER_NOT_FOUND' } }));
    if (!user.isActive) return next(Object.assign(new Error('USER_INACTIVE'), { data: { code: 'USER_INACTIVE' } }));

    customSocket.user = {
      _id: user._id as any,
      id: String(user._id),
      email: user.email,
      name: user.name || user.email.split('@')[0],
      organizationId: user.organizationId as any,
      orgId: String(user.organizationId),
      role: user.role || 'member',
      isAdmin: ADMIN_ROLES.has(user.role || ''),
    };

    customSocket.joinedChannels = new Set();
    customSocket.rateLimits = new Map();

    logger.info(`✅ Socket authenticated: User ${userId}`);
    next();
  } catch (err) {
    logger.error(`🔴 Socket Auth Error: ${(err as Error).message}`);
    next(Object.assign(new Error('INTERNAL_ERROR'), { data: { code: 'INTERNAL_ERROR' } }));
  }
};