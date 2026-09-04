import redis from '../database/redisClient';

/**
 * Thin, opinionated wrapper around Redis.
 * Modules should NEVER call redis.get/set directly — always go through this,
 * so caching strategy (prefixing, serialization, locking) lives in one place.
 */
export class CacheService {
  private readonly namespace: string;

  constructor(namespace: string) {
    // e.g. new CacheService('products') -> keys are prefixed "cache:products:*"
    this.namespace = namespace;
  }

  private key(key: string): string {
    return `cache:${this.namespace}:${key}`;
  }

  async get<T>(key: string): Promise<T | null> {
    const raw = await redis.get(this.key(key));
    return raw ? (JSON.parse(raw) as T) : null;
  }

  async set<T>(key: string, value: T, ttlSeconds = 300): Promise<void> {
    await redis.set(this.key(key), JSON.stringify(value), 'EX', ttlSeconds);
  }

  async forget(key: string): Promise<void> {
    await redis.del(this.key(key));
  }

  /**
   * Cache-aside helper: return cached value, or compute + cache it.
   *   const products = await cache.remember('list:active', 60, () => repo.findActive());
   */
  async remember<T>(key: string, ttlSeconds: number, computeFn: () => Promise<T>): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;
    const fresh = await computeFn();
    await this.set<T>(key, fresh, ttlSeconds);
    return fresh;
  }

  /**
   * Invalidate every key under this namespace (e.g. after a bulk write).
   * Use sparingly — SCAN-based, not instant on huge keyspaces.
   */
  async flushNamespace(): Promise<void> {
    const stream = redis.scanStream({ match: this.key('*') });
    const pipeline = redis.pipeline();
    let count = 0;
    for await (const keys of stream as AsyncIterable<string[]>) {
      keys.forEach((k) => {
        pipeline.del(k);
        count += 1;
      });
    }
    if (count) await pipeline.exec();
  }

  /**
   * Simple distributed lock (e.g. to prevent double-processing a webhook).
   * Returns true if lock acquired.
   *
   * Note: argument order is `EX, seconds, NX` (rather than `NX, EX, seconds`
   * as in the original JS) to satisfy ioredis v5's typed `.set()` overloads.
   * The Redis command executed is equivalent: SET key val EX ttl NX.
   */
  async lock(key: string, ttlSeconds = 10): Promise<boolean> {
    const result = await redis.set(this.key(`lock:${key}`), '1', 'EX', ttlSeconds, 'NX');
    return result === 'OK';
  }

  async release(key: string): Promise<void> {
    await redis.del(this.key(`lock:${key}`));
  }
}