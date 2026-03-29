const { Worker } = require('bullmq');
const Redis = require('ioredis');
const axios = require('axios');
const crypto = require('crypto');
const dns = require('dns').promises;

const Webhook = require('./webhook.model');
const WebhookDelivery = require('./webhookDelivery.model');

const connection = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  retryStrategy(times) {
    if (times > 3) {
      console.error('⚠️ [WebhookWorker] Redis connection failed continuously. Is Redis running on 6379?');
      return null;
    }
    return Math.min(times * 500, 2000);
  }
});

// ── SSRF Protection ──────────────────────────────────
const PRIVATE_IP_REGEX = /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.|0\.0\.0\.0|::1|fc00:|fe80:)/;

async function validateUrl(urlString) {
  let url;
  try {
    url = new URL(urlString);
  } catch {
    throw Object.assign(new Error('Invalid URL format'), { code: 'INVALID_URL' });
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw Object.assign(new Error('URL must use HTTP or HTTPS'), { code: 'INVALID_PROTOCOL' });
  }

  const addresses = await dns.resolve4(url.hostname).catch(() => []);
  if (addresses.some(ip => PRIVATE_IP_REGEX.test(ip))) {
    throw Object.assign(new Error('URL resolves to a private IP (SSRF blocked)'), { code: 'SSRF_BLOCKED' });
  }
}

// ── Sign Payload ─────────────────────────────────────
function signPayload(body, secret) {
  return crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(body))
    .digest('hex');
}

// ── Main Worker ───────────────────────────────────────
const worker = new Worker('webhook-deliveries', async (job) => {
  const { webhookId, deliveryId, event, payload, attempt } = job.data;

  const [hook, delivery] = await Promise.all([
    Webhook.findById(webhookId).select('+_encryptedSecret'),
    WebhookDelivery.findOne({ deliveryId })
  ]);

  // Webhook deleted or deactivated since job was enqueued
  if (!hook || !hook.isActive) {
    await delivery?.updateOne({ status: 'skipped', errorCode: 'WEBHOOK_INACTIVE' });
    return;
  }

  // Circuit breaker check
  if (!hook.canDeliver()) {
    await delivery?.updateOne({ 
      status: 'skipped', 
      errorCode: 'CIRCUIT_OPEN',
      errorMessage: `Circuit open until ${hook.circuitBreaker.nextRetryAt}`
    });
    return; // Don't throw — we don't want BullMQ to retry a circuit-open skip
  }

  // SSRF check
  try {
    await validateUrl(hook.url);
  } catch (err) {
    await delivery?.updateOne({ 
      status: 'failed', 
      errorCode: err.code, 
      errorMessage: err.message 
    });
    await hook.recordFailure();
    throw err; // Let BullMQ handle retry
  }

  // Build & sign payload
  const body = {
    id:        deliveryId,
    event,
    timestamp: new Date().toISOString(),
    data:      payload,
  };

  const secret = hook.getSecret();
  const signature = signPayload(body, secret);
  const timestamp = Date.now();

  const headers = {
    'Content-Type':      'application/json',
    'X-Apex-Signature':  `sha256=${signature}`,
    'X-Apex-Timestamp':  String(timestamp),
    'X-Apex-Delivery-Id': deliveryId,
    'User-Agent':        'Apex-Webhooks/1.0',
  };

  await delivery?.updateOne({ 
    requestPayload: body, 
    requestHeaders: headers,
    requestUrl: hook.url,
    status: 'retrying',
    attempt: job.attemptsMade + 1
  });

  const start = Date.now();

  try {
    const response = await axios.post(hook.url, body, {
      headers,
      timeout: 10_000, // 10 second hard timeout
      maxRedirects: 3,
      validateStatus: null, // Don't throw on 4xx/5xx — we handle it
    });

    const duration = Date.now() - start;
    const success = response.status >= 200 && response.status < 300;

    await delivery?.updateOne({
      status:         success ? 'success' : 'failed',
      responseStatus: response.status,
      responseBody:   JSON.stringify(response.data).substring(0, 5000),
      responseTimeMs: duration,
      errorMessage:   success ? undefined : `HTTP ${response.status}`,
    });

    if (success) {
      await hook.recordSuccess();
    } else {
      await hook.recordFailure();
      // Treat 4xx (except 429) as permanent failure — no retry
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        return; // Don't throw — prevents BullMQ retry for client errors
      }
      throw new Error(`HTTP ${response.status}`); // 5xx → BullMQ retries
    }

  } catch (err) {
    const duration = Date.now() - start;
    const errorCode = err.code || 'UNKNOWN';

    await delivery?.updateOne({
      status:        'failed',
      responseTimeMs: duration,
      errorMessage:  err.message,
      errorCode,
    });

    await hook.recordFailure();
    throw err; // Re-throw so BullMQ schedules next retry
  }

}, {
  connection,
  concurrency: 20,  // Process 20 webhook jobs in parallel
});

// Mark as 'abandoned' when all BullMQ retries are exhausted
worker.on('failed', async (job, err) => {
  if (job.attemptsMade >= job.opts.attempts) {
    await WebhookDelivery.findOneAndUpdate(
      { deliveryId: job.data.deliveryId },
      { status: 'abandoned', nextRetryAt: null }
    );
    console.error(`🚫 Delivery abandoned after ${job.attemptsMade} attempts:`, job.data.deliveryId);
  }
});

console.log('🚀 Webhook worker started');
module.exports = worker;