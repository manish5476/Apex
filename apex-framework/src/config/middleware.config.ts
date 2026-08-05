import { Application, Request, Response, NextFunction } from 'express';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import cors from 'cors';
import logger, { loggerStream } from '../core/logger';
// Assuming these exist in your new core based on earlier code
import { updateSessionActivity } from '../core/http/middlewares/session.middleware';
import { assignRequestId } from '../core/http/middlewares/requestId.middleware';

export class MiddlewareConfig {
  private static readonly corsOptions = cors({
    origin: process.env.CORS_ORIGIN
      ? process.env.CORS_ORIGIN.split(',')
      : ['http://localhost:4200', 'https://apex-infinity.vercel.app'],
    credentials: true,
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Request-Id',
      'X-API-Key',
      'X-Storefront-Request',
      'X-Storefront-Session',
      'X-Customer-Token',
    ],
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    exposedHeaders: ['X-Request-Id', 'X-RateLimit-Limit', 'X-RateLimit-Remaining'],
  });

  private static readonly morganDevelopment = morgan(':id :method :url :status :response-time ms');
  private static readonly morganProduction = morgan(
    ':id :remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent"',
    {
      stream: loggerStream,
      skip: (req: Request) => req.path === '/health',
    }
  );

  static applyStandardMiddleware(app: Application): Application {
    app.use(assignRequestId);
    app.use(this.corsOptions);
    app.options('*', this.corsOptions);

    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Max-Age', '86400'); 
        res.sendStatus(204);
        return;
      }
      next();
    });

    app.use(cookieParser());
    app.use(compression({ level: 6 }));

    if (process.env.NODE_ENV === 'development') {
      app.use(this.morganDevelopment);
    } else {
      app.use(this.morganProduction);
    }

    app.use(updateSessionActivity);

    return app;
  }

  static applyPerformanceMiddleware(app: Application): Application {
    app.use((req: Request, res: Response, next: NextFunction) => {
      // @ts-ignore - ID comes from assignRequestId
      const requestId = req.id || 'unknown';
      req.setTimeout(30000, () => {
        logger.warn(`Request timeout: ${requestId} ${req.method} ${req.url}`);
        if (!res.headersSent) {
          res.status(408).json({
            error: 'Request timeout',
            requestId,
          });
        }
      });
      res.setTimeout(30000);
      next();
    });

    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.method === 'GET') {
        res.set('Cache-Control', 'private, max-age=60');
      }
      next();
    });

    return app;
  }

  static maintenanceMode(req: Request, res: Response, next: NextFunction): void {
    if (process.env.MAINTENANCE_MODE === 'true' && req.path !== '/health') {
      res.status(503).json({
        status: 'maintenance',
        message: 'Service is undergoing maintenance',
        estimatedRestoration: process.env.MAINTENANCE_ETA || 'Soon',
        timestamp: new Date().toISOString(),
      });
      return;
    }
    next();
  }
}