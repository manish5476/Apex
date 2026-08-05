import { Request } from 'express';
import { Types } from 'mongoose';
import { AuditLog } from '../../infrastructure/models/auditLog.model';
import { AuthenticatedUser } from '@core/http/types';

export interface LogAuditParams {
  user?: Partial<AuthenticatedUser>;
  action: string;
  entityType?: string | null;
  entityId?: Types.ObjectId | string | null;
  req?: Request | null;
  meta?: Record<string, unknown>;
}

export class AuditService {
  static async logAudit({ 
    user = {}, 
    action, 
    entityType = null, 
    entityId = null, 
    req = null, 
    meta = {} 
  }: LogAuditParams): Promise<void> {
    try {
      const payload: Record<string, unknown> = {
        userId: user._id || user.id || null,
        organizationId: user.organizationId || null,
        action,
        entityType,
        entityId,
        meta: { ...meta }
      };

      if (req) {
        payload.ip = req.ip || (req.headers && (req.headers['x-forwarded-for'] || req.socket?.remoteAddress)) || null;
        payload.userAgent = req.headers?.['user-agent'] || null;
        (payload.meta as Record<string, unknown>).request = { 
          method: req.method, 
          path: req.originalUrl, 
          query: req.query || {} 
        };
      }

      await AuditLog.create(payload);
    } catch (err) {
      console.error('[AuditService] Failed to log audit:', err);
    }
  }
}