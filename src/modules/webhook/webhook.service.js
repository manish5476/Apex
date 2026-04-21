const Webhook = require('./webhook.model');
const WebhookDelivery = require('./webhookDelivery.model');
const { enqueueWebhookDelivery } = require('./webhook.queue');

/**
 * Main entry point. Call from any controller:
 *   triggerEvent('invoice.created', invoiceDoc, orgId)
 */
exports.triggerEvent = async (eventName, payload, orgId) => {
  // Fire and forget — never block the API
  _processEvent(eventName, payload, orgId).catch(err =>
    console.error(`❌ Automation pipeline error [${eventName}]:`, err.message)
  );
};

async function _processEvent(eventName, payload, orgId) {
  // Run webhooks
  await _processWebhooks(eventName, payload, orgId);
}



async function _processWebhooks(eventName, payload, orgId) {
  const hooks = await Webhook.find({
    organizationId: orgId,
    events: eventName,
    isActive: true
  });

  // Create delivery log + enqueue — all in parallel
  await Promise.allSettled(
    hooks.map(hook => _enqueueDelivery(hook, eventName, payload))
  );
}

async function _enqueueDelivery(hook, event, payload) {
  const { v4: uuidv4 } = await import('uuid');
  const deliveryId = uuidv4();

  // Write delivery log immediately so it appears in dashboard as 'pending'
  await WebhookDelivery.create({
    webhookId: hook._id,
    organizationId: hook.organizationId,
    deliveryId,
    event,
    requestPayload: payload,
    requestUrl: hook.url,
    status: 'pending',
    maxAttempts: 5,
  });

  await enqueueWebhookDelivery({
    webhookId: hook._id.toString(),
    deliveryId,
    event,
    payload,
  });
}