import { NextFunction, Request, RequestHandler, Response } from 'express';

type AsyncRequestHandler
  Params = Record<string, string>,
  ResBody = unknown,
  ReqBody = unknown,
  ReqQuery = Record<string, unknown>
> = (
  req: Request<Params, ResBody, ReqBody, ReqQuery>,
  res: Response<ResBody>,
  next: NextFunction
) => Promise<unknown>;

/**
 * Wraps an async controller/middleware so rejected promises are forwarded
 * to Express's error handler instead of crashing the process.
 *   router.get('/', catchAsync(controller.list));
 */
export function catchAsync
  Params = Record<string, string>,
  ResBody = unknown,
  ReqBody = unknown,
  ReqQuery = Record<string, unknown>
>(
  fn: AsyncRequestHandler<Params, ResBody, ReqBody, ReqQuery>
): RequestHandler<Params, ResBody, ReqBody, ReqQuery> {
  return (req, res, next): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}