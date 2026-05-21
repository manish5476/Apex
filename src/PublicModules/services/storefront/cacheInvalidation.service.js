'use strict';

const redisUtils = require('../../../config/redis');

class StorefrontCacheInvalidationService {
  async invalidatePage(organizationId, slug) {
    if (!organizationId) return;
    const pageSlug = slug || 'home';
    await redisUtils.safeCache.delete(`page_structure:${organizationId}:${pageSlug}`);
  }

  async invalidateStore(organizationId) {
    if (!organizationId) return;
    await Promise.all([
      redisUtils.safeCache.delete(`layout:${organizationId}`),
      redisUtils.safeCache.clear(`page_structure:${organizationId}:*`),
      redisUtils.safeCache.clear(`smart_rule_v2:${organizationId}:*`),
      redisUtils.safeCache.clear(`smart_rule_v2:adhoc:${organizationId}:*`)
    ]);
  }
}

module.exports = new StorefrontCacheInvalidationService();
