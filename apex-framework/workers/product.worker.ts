require('dotenv').config();
const { Worker } = require('bullmq');

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
};

const worker = new Worker(
  'products',
  async (job) => {
    if (job.name === 'reindex') {
      console.log(`[worker:products] reindexing product ${job.data.productId}`);
      // TODO: push to Elasticsearch / Algolia / whatever search backend
    }
  },
  { connection }
);

worker.on('completed', (job) => console.log(`[worker:products] job ${job.id} done`));
worker.on('failed', (job, err) => console.error(`[worker:products] job ${job.id} failed:`, err.message));

console.log('[worker:products] listening for jobs...');
