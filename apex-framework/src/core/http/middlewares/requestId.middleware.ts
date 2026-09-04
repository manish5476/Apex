import { Request, Response, NextFunction, RequestHandler } from 'express';
import crypto from 'crypto';

export const assignRequestId: RequestHandler = (req: Request, res: Response, next: NextFunction): void => {
  const existingId = req.headers['x-request-id'] as string;
  const reqId = existingId || crypto.randomUUID();
  
  // @ts-ignore - extending Request object dynamically for standard use
  req.id = reqId;
  res.setHeader('X-Request-Id', reqId);
  
  next();
};