import mongoose from 'mongoose';
import { RateLimitBucket } from './socket.types';

export class SocketUtils {
  static sanitize(value: unknown, maxLen = 500): string {
    if (typeof value !== 'string') return '';
    return value
      .replace(/<[^>]*>/g, '') // strip HTML
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // strip control chars
      .trim()
      .slice(0, maxLen);
  }

  static isValidObjectId(id: string): boolean {
    return mongoose.Types.ObjectId.isValid(id);
  }

  static checkRateLimit(
    store: Map<string, RateLimitBucket>,
    key: string,
    maxTokens: number,
    refillMs: number
  ): boolean {
    const now = Date.now();
    if (!store.has(key)) {
      store.set(key, { tokens: maxTokens - 1, lastRefill: now });
      return true;
    }
    
    const bucket = store.get(key)!;
    const elapsed = now - bucket.lastRefill;
    const refilled = Math.floor(elapsed / refillMs);
    
    if (refilled > 0) {
      bucket.tokens = Math.min(maxTokens, bucket.tokens + refilled);
      bucket.lastRefill = now;
    }
    
    if (bucket.tokens > 0) {
      bucket.tokens--;
      return true;
    }
    return false;
  }
}