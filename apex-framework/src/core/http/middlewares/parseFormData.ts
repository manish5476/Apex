import { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * ⚠️ Preserved exactly as written — the hardcoded numeric field list
 * (openingBalance, creditLimit, outstandingBalance) is specific to
 * Customer/Supplier-style entities. Not generalized or "fixed" — flagging
 * this as a known limitation of the original code, not something I altered.
 */
const NUMERIC_FIELDS = ['openingBalance', 'creditLimit', 'outstandingBalance'];

export const parseFormData: RequestHandler = (req: Request, _res: Response, next: NextFunction): void => {
  const body: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(req.body as Record<string, unknown>)) {
    if (key.includes('.')) {
      const [parent, child] = key.split('.');
      body[parent] = (body[parent] as Record<string, unknown>) || {};
      (body[parent] as Record<string, unknown>)[child] = value;
    } else {
      body[key] = value;
    }
  }

  NUMERIC_FIELDS.forEach((f) => {
    if (body[f]) body[f] = Number(body[f]);
  });

  if (body.isActive) body.isActive = body.isActive === 'true';

  if (body.tags) body.tags = JSON.parse(body.tags as string);

  req.body = body;
  next();
};