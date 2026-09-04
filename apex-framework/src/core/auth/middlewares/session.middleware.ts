import { Response, NextFunction, RequestHandler } from 'express';
import { catchAsync } from '../../http/catchAsync';
import Session from '@modules/iam/infrastructure/models/session.model';

export const updateSessionActivity: RequestHandler = catchAsync(async (req, _res, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return next();

  const token = authHeader.split(' ')[1];

  await Session.findOneAndUpdate(
    { token, isValid: true },
    { $set: { lastActivityAt: new Date() } }
  ).lean();

  next();
});