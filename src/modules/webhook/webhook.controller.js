const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const crypto = require('crypto');
const Webhook = require('./webhook.model');
const WebhookDelivery = require('./webhookDelivery.model');
const { enqueueWebhookDelivery } = require('./webhook.queue');
const catchAsync = require('../../core/utils/catchAsync');
const AppError = require('../../core/utils/AppError');

// ── CRUD ─────────────────────────────────────────────
exports.createWebhook = catchAsync(async (req, res) => {
  const { name, url, events, secret } = req.body;

  const hook = new Webhook({
    organizationId: req.user.organizationId,
    name,
    url,
    events,
  });

  // Use virtual setter — encrypts before save
  if (secret) hook.secret = secret;

  await hook.save();

  res.status(201).json({ status: 'success', data: { webhook: hook } });
});

exports.getAllWebhooks = catchAsync(async (req, res) => {
  const hooks = await Webhook.find({
    organizationId: req.user.organizationId
  }).select('-_encryptedSecret');

  res.status(200).json({ status: 'success', results: hooks.length, data: { hooks } });
});

exports.updateWebhook = catchAsync(async (req, res) => {
  const hook = await Webhook.findOne({
    _id: req.params.id,
    organizationId: req.user.organizationId
  });

  if (!hook) throw new AppError('Webhook not found', 404);

  const { name, url, events, secret, isActive } = req.body;
  if (name)     hook.name = name;
  if (url)      hook.url = url;
  if (events)   hook.events = events;
  if (isActive !== undefined) hook.isActive = isActive;
  if (secret)   hook.secret = secret; // Re-encrypts

  await hook.save();
  res.status(200).json({ status: 'success', data: { webhook: hook } });
});

exports.deleteWebhook = catchAsync(async (req, res) => {
  const hook = await Webhook.findOneAndDelete({
    _id: req.params.id,
    organizationId: req.user.organizationId
  });

  if (!hook) throw new AppError('Webhook not found', 404);
  res.status(204).json({ status: 'success', data: null });
});

// ── Test Endpoint ─────────────────────────────────────
exports.testWebhook = catchAsync(async (req, res) => {
  const hook = await Webhook.findOne({
    _id: req.params.id,
    organizationId: req.user.organizationId
  }).select('+_encryptedSecret');

  if (!hook) throw new AppError('Webhook not found', 404);

  const body = {
    id:        uuidv4(),
    event:     'webhook.test',
    timestamp: new Date().toISOString(),
    data:      { message: 'This is a test delivery from Apex' },
  };

  const secret = hook.getSecret();
  const signature = crypto
    .createHmac('sha256', secret || 'no-secret')
    .update(JSON.stringify(body))
    .digest('hex');

  const start = Date.now();
  const response = await axios.post(hook.url, body, {
    headers: {
      'Content-Type':       'application/json',
      'X-Apex-Signature':   `sha256=${signature}`,
      'X-Apex-Timestamp':   String(Date.now()),
      'X-Apex-Delivery-Id': body.id,
    },
    timeout: 10_000,
    validateStatus: null,
  });

  res.status(200).json({
    status: 'success',
    data: {
      responseStatus:  response.status,
      responseTimeMs:  Date.now() - start,
      responseBody:    JSON.stringify(response.data).substring(0, 1000),
      success:         response.status >= 200 && response.status < 300,
    }
  });
});

// ── Replay a Failed Delivery ──────────────────────────
exports.replayDelivery = catchAsync(async (req, res) => {
  const delivery = await WebhookDelivery.findOne({
    deliveryId:     req.params.deliveryId,
    organizationId: req.user.organizationId
  });

  if (!delivery) throw new AppError('Delivery not found', 404);
  if (delivery.status === 'success') {
    throw new AppError('Cannot replay a successful delivery', 400);
  }

  const newDeliveryId = uuidv4();

  await WebhookDelivery.create({
    webhookId:          delivery.webhookId,
    organizationId:     delivery.organizationId,
    deliveryId:         newDeliveryId,
    event:              delivery.event,
    requestPayload:     delivery.requestPayload,
    requestUrl:         delivery.requestUrl,
    status:             'pending',
    isReplay:           true,
    originalDeliveryId: delivery.deliveryId,
    maxAttempts:        5,
  });

  await enqueueWebhookDelivery({
    webhookId:  delivery.webhookId.toString(),
    deliveryId: newDeliveryId,
    event:      delivery.event,
    payload:    delivery.requestPayload,
  });

  res.status(200).json({
    status: 'success',
    message: 'Replay queued',
    data: { newDeliveryId }
  });
});

// ── Delivery Logs (Dashboard) ─────────────────────────
exports.getDeliveries = catchAsync(async (req, res) => {
  const { webhookId, status, page = 1, limit = 20 } = req.query;

  const filter = { organizationId: req.user.organizationId };
  if (webhookId) filter.webhookId = webhookId;
  if (status)    filter.status = status;

  const skip = (page - 1) * limit;

  const [deliveries, total] = await Promise.all([
    WebhookDelivery.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .populate('webhookId', 'name url'),
    WebhookDelivery.countDocuments(filter)
  ]);

  res.status(200).json({
    status: 'success',
    data: {
      deliveries,
      pagination: {
        total,
        page:       Number(page),
        totalPages: Math.ceil(total / limit),
      }
    }
  });
});

// ── Dashboard Stats ───────────────────────────────────
exports.getWebhookStats = catchAsync(async (req, res) => {
  const orgId = req.user.organizationId;
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // Last 7 days

  const stats = await WebhookDelivery.aggregate([
    { $match: { organizationId: orgId, createdAt: { $gte: since } } },
    { $group: {
      _id: '$status',
      count: { $sum: 1 },
      avgResponseTime: { $avg: '$responseTimeMs' }
    }}
  ]);

  res.status(200).json({ status: 'success', data: { stats } });
});