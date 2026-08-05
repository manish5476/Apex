const CacheService = require('../../../core/cache');

// Namespaced 'products' -> keys look like cache:products:*
module.exports = new CacheService('products');
