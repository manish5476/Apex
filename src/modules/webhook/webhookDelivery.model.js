const mongoose = require('mongoose');
const { Schema } = mongoose;

const WebhookDeliverySchema = new Schema({
  webhookId:      { type: Schema.Types.ObjectId, ref: 'Webhook', required: true },
  organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },

  deliveryId: { 
    type: String, 
    required: true, 
    unique: true  // UUID — idempotency key
  },

  event:   { type: String, required: true },
  isReplay:{ type: Boolean, default: false },
  originalDeliveryId: { type: String }, // Set when this is a replay

  // Full snapshot for replay capability
  requestUrl:     String,
  requestPayload: { type: Schema.Types.Mixed },
  requestHeaders: { type: Schema.Types.Mixed },

  // Response
  responseStatus:  Number,
  responseBody:    { type: String, maxlength: 5000 },
  responseTimeMs:  Number,

  // Retry tracking
  attempt:     { type: Number, default: 1 },
  maxAttempts: { type: Number, default: 5 },
  nextRetryAt: Date,

  status: {
    type: String,
    enum: ['pending', 'success', 'failed', 'retrying', 'abandoned', 'skipped'],
    default: 'pending',
    index: true
  },

  errorMessage:  String,
  errorCode:     String, // e.g. ECONNREFUSED, TIMEOUT, SSRF_BLOCKED
}, { timestamps: true });

// ── Indexes ──────────────────────────────────────────
WebhookDeliverySchema.index({ webhookId: 1, createdAt: -1 });       // Per-webhook history
WebhookDeliverySchema.index({ organizationId: 1, createdAt: -1 });  // Org-wide dashboard
WebhookDeliverySchema.index({ organizationId: 1, status: 1 });      // Filter by status
WebhookDeliverySchema.index({ status: 1, nextRetryAt: 1 });         // Retry job pickup

// Auto-delete logs after 90 days
WebhookDeliverySchema.index(
  { createdAt: 1 }, 
  { expireAfterSeconds: 90 * 24 * 60 * 60 }
);

module.exports = mongoose.model('WebhookDelivery', WebhookDeliverySchema);