import { Request, Response, NextFunction, RequestHandler } from 'express';
import { getRedis, isRedisEnabled } from './redisClient';

export const safeCache = {
  get: async <T>(key: string): Promise<T | null> => {
    try {
      const redis = await getRedis();
      if (!redis) return null;
      const cached = await redis.get(key);
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  },

  set: async <T>(key: string, data: T, ttl = 300): Promise<boolean> => {
    try {
      const redis = await getRedis();
      if (!redis) return false;
      await redis.setex(key, ttl, JSON.stringify(data));
      return true;
    } catch {
      return false;
    }
  },

  delete: async (key: string): Promise<boolean> => {
    try {
      const redis = await getRedis();
      if (!redis) return false;
      await redis.del(key);
      return true;
    } catch {
      return false;
    }
  }
};

export const cacheMiddleware = (duration = 300): RequestHandler => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (req.method !== 'GET' || !isRedisEnabled()) {
      return next();
    }

    const key = `cache:${req.originalUrl || req.url}`;

    try {
      const cachedData = await safeCache.get<Record<string, unknown>>(key);

      if (cachedData) {
        res.status(200).json({
          ...cachedData,
          _meta: { cached: true, key, timestamp: new Date().toISOString() },
        });
        return;
      }

      const originalJson = res.json.bind(res);
      res.json = (body: any) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          safeCache.set(key, body, duration).catch(() => {});
        }
        return originalJson(body);
      };

      next();
    } catch {
      next();
    }
  };
};