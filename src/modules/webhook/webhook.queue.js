const { Queue, QueueEvents } = require('bullmq');
const Redis = require('ioredis');

const redisUrl = process.env.REDIS_URL;

let webhookQueue = null;
let queueEvents = null;
let connection = null;

if (redisUrl) {
  connection = new Redis(redisUrl, {
    maxRetriesPerRequest: null, // Required by BullMQ
    enableReadyCheck: false,
    retryStrategy(times) {
      if (times > 3) {
        console.warn('⚠️ [WebhookQueue] Redis connection failed after 3 attempts. Disabling queue features.');
        return null;
      }
      return Math.min(times * 500, 2000);
    }
  });

  // The queue all webhook jobs go through
  webhookQueue = new Queue('webhook-deliveries', {
    connection,
    defaultJobOptions: {
      attempts: 5,
      backoff: {
        type: 'exponential',
        delay: 60_000,
      },
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 5000 },
    }
  });

  // Log queue-level events (useful for monitoring)
  queueEvents = new QueueEvents('webhook-deliveries', { connection });

  queueEvents.on('completed', ({ jobId }) => {
    console.log(`✅ Webhook job ${jobId} completed`);
  });

  queueEvents.on('failed', ({ jobId, failedReason }) => {
    console.error(`❌ Webhook job ${jobId} failed: ${failedReason}`);
  });
} else {
  console.log('ℹ️ [WebhookQueue] Redis disabled. Background webhooks will be skipped.');
}

/**
 * Add a webhook delivery job to the queue.
 * Called from webhook.service.js after triggerEvent().
 */
async function enqueueWebhookDelivery(data) {
  if (!webhookQueue) {
    console.warn(`⚠️ [WebhookQueue] Enqueue skipped for deliveryId ${data.deliveryId} (Redis disabled).`);
    return null;
  }
  const job = await webhookQueue.add('deliver', data, {
    jobId: data.deliveryId, // Idempotency
  });
  return job;
}

module.exports = { webhookQueue, enqueueWebhookDelivery };