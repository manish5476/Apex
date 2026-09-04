import { Response, NextFunction, RequestHandler } from 'express';
import { AuthenticatedRequest } from '@core/http/types';
import { catchAsync } from '@core/http/catchAsync';
import { ApiError } from '@core/errors/ApiError';
import Organization from '@modules/organization/infrastructure/models/organization.model';

export const checkPeriodLock: RequestHandler = catchAsync(async (req, _res, next: NextFunction) => {
  const authReq = req as AuthenticatedRequest;
  const txnDate = req.body.invoiceDate || req.body.paymentDate || req.body.purchaseDate || req.body.date;

  if (!txnDate) return next();

  const org = await Organization.findById(authReq.user.organizationId).select('settings.lockDate');

  if (org?.settings?.lockDate) {
    const txnTime = new Date(txnDate).getTime();
    const lockTime = new Date(org.settings.lockDate).getTime();

    if (txnTime <= lockTime) {
      return next(
        ApiError.forbidden(
          `PERIOD LOCKED: You cannot add/edit transactions before ${new Date(lockTime).toDateString()}. \n` +
          '-> This period has been closed for Accounting/Tax purposes.'
        )
      );
    }
  }
  next();
});