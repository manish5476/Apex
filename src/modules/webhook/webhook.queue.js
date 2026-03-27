const { Queue, QueueEvents } = require('bullmq');
const Redis = require('ioredis');

const connection = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null, // Required by BullMQ
  enableReadyCheck: false,
});

// The queue all webhook jobs go through
const webhookQueue = new Queue('webhook-deliveries', {
  connection,
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 60_000, // 1 min → 2 min → 4 min → 8 min → 16 min
    },
    removeOnComplete: { count: 1000 },  // Keep last 1000 completed
    removeOnFail: { count: 5000 },      // Keep last 5000 failed for review
  }
});

// Log queue-level events (useful for monitoring)
const queueEvents = new QueueEvents('webhook-deliveries', { connection });

queueEvents.on('completed', ({ jobId }) => {
  console.log(`✅ Webhook job ${jobId} completed`);
});

queueEvents.on('failed', ({ jobId, failedReason }) => {
  console.error(`❌ Webhook job ${jobId} failed: ${failedReason}`);
});

/**
 * Add a webhook delivery job to the queue.
 * Called from webhook.service.js after triggerEvent().
 */
async function enqueueWebhookDelivery(data) {
  const job = await webhookQueue.add('deliver', data, {
    jobId: data.deliveryId, // Idempotency — same deliveryId = same job
  });
  return job;
}

module.exports = { webhookQueue, enqueueWebhookDelivery };