import { CacheService } from '../../../../../core/cache';
import { HydratedDocument } from 'mongoose';
import { IMasterRecord } from '../../infrastructure/models/masterRecord.model';

/**
 * ⚠️ New infrastructure, not a port — old code never cached master lists.
 * Wired here only because the folder structure mandates a cache/ layer and
 * the core CacheService pattern exists for exactly this. Caches the
 * "list masters by org+type" read path only. Does NOT change response
 * shape or business rules — purely a read-through cache with explicit
 * invalidation on every write.
 */
export class MasterRecordCache {
  private readonly cache = new CacheService('masterRecord');

  private listKey(organizationId: unknown, type?: string): string {
    return `list:${String(organizationId)}:${type ?? 'all'}`;
  }

  async rememberList<T>(
    organizationId: unknown,
    type: string | undefined,
    ttlSeconds: number,
    computeFn: () => Promise<T>
  ): Promise<T> {
    return this.cache.remember(this.listKey(organizationId, type), ttlSeconds, computeFn);
  }

  /** Call after any create/update/delete affecting this org's masters. */
  async invalidateOrg(organizationId: unknown): Promise<void> {
    // Namespace-wide flush is coarse but correct — per-type key tracking
    // would require maintaining a key index, which the old code never had.
    await this.cache.flushNamespace();
    void organizationId; // kept for future scoped invalidation if needed
  }
}

export type CachedMasterRecord = HydratedDocument<IMasterRecord>;