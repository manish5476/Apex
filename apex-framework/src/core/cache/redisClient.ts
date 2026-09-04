import Redis, { RedisOptions } from 'ioredis';
import logger from '../logger';

let redisInstance: Redis | null = null;
let isInitialized = false;
let isEnabled = process.env.REDIS_ENABLED !== 'false';

export const initializeRedis = async (): Promise<Redis | null> => {
  if (isInitialized) return redisInstance;
  isInitialized = true;

  if (!isEnabled) {
    logger.warn('🟡 Redis cache disabled via environment variable');
    return null;
  }

  try {
    const config: RedisOptions = {
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD || undefined,
      lazyConnect: true,
      retryStrategy: (times: number) => {
        if (times > 3) {
          logger.warn('🟡 Redis connection failed after 3 attempts, disabling cache');
          isEnabled = false;
          return null; // Stop retrying
        }
        return Math.min(times * 100, 3000);
      },
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false, // Prevents memory leaks by not queuing commands endlessly when down
      showFriendlyErrorStack: process.env.NODE_ENV === 'development',
    };

    redisInstance = process.env.REDIS_URL
      ? new Redis(process.env.REDIS_URL, config)
      : new Redis(config);

    redisInstance.on('error', (err: Error) => {
      logger.warn(`🟡 Redis Error: ${err.message}`);
      if (err.message.includes('ECONNREFUSED')) {
        isEnabled = false;
      }
    });

    redisInstance.on('connect', () => {
      logger.info('✅ Redis connected');
      isEnabled = true;
    });

    await redisInstance.connect();
    return redisInstance;
  } catch (error) {
    logger.warn(`🟡 Redis Init Error: ${(error as Error).message}`);
    isEnabled = false;
    return null;
  }
};

export const getRedis = async (): Promise<Redis | null> => {
  if (!isEnabled) return null;
  if (redisInstance && redisInstance.status === 'ready') return redisInstance;
  return initializeRedis();
};

export const isRedisEnabled = (): boolean => isEnabled;

/**
 * Synchronous getter for libraries that require a direct client instance.
 * Call `initializeRedis()` during application bootstrap before using this.
 */
export const getRawRedisClient = (): Redis | null => redisInstance;
