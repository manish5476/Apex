const { Queue } = require('bullmq');

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
};

const productQueue = new Queue('products', { connection });

/**
 * Example: queue a search-index rebuild instead of doing it inline
 * on every write. Call this from the service when needed:
 *   const { queueReindex } = require('../../jobs/product.jobs');
 *   await queueReindex(product._id);
 */
async function queueReindex(productId) {
  await productQueue.add('reindex', { productId }, { attempts: 3, backoff: { type: 'exponential', delay: 2000 } });
}

module.exports = { productQueue, queueReindex };
