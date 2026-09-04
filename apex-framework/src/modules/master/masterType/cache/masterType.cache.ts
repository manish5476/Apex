import { CacheService } from '../../../../../core/cache';

/**
 * ⚠️ New infrastructure, not a port — old code never cached this.
 * MasterType is small, low-write, read-often (used to populate dropdown
 * "type" options across the app) — a good caching candidate, but wiring
 * it is a structural requirement of this folder existing, not a business
 * rule inferred from your old code. Kept minimal and explicit.
 */
export class MasterTypeCache {
  private readonly cache = new CacheService('masterType');
  private readonly ACTIVE_LIST_KEY = 'list:active';

  async rememberActiveList<T>(ttlSeconds: number, computeFn: () => Promise<T>): Promise<T> {
    return this.cache.remember(this.ACTIVE_LIST_KEY, ttlSeconds, computeFn);
  }

  async invalidate(): Promise<void> {
    await this.cache.forget(this.ACTIVE_LIST_KEY);
  }
}