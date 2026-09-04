import { Request } from 'express';
import { Types } from 'mongoose';

/**
 * ⚠️ INFERRED — your Auth module hasn't been migrated yet.
 * `name` and `id` added because handlerFactory.exportExcel reads
 * req.user.name, and bulkCreate/bulkUpdate/bulkDelete read req.user.id
 * (inconsistently vs. req.user._id elsewhere) — both preserved exactly
 * as used in your original JS, not normalized.
 */
export interface AuthenticatedUser {
  _id: Types.ObjectId;
  id?: string;
  organizationId: Types.ObjectId;
  name?: string;
  [key: string]: unknown;
}

export interface AuthenticatedRequest
  Params = Record<string, string>,
  ResBody = unknown,
  ReqBody = unknown,
  ReqQuery = Record<string, unknown>
> extends Request<Params, ResBody, ReqBody, ReqQuery> {
  user: AuthenticatedUser;
}