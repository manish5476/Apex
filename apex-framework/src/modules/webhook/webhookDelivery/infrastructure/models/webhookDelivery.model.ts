const mongoose = require('mongoose');
const { getConnection } = require('../../../../../core/database');

const webhookDeliverySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    // TODO: add WebhookDelivery-specific fields here
  },
  { timestamps: true }
);

const conn = getConnection(process.env.WEBHOOKDELIVERY_DB_NAME || 'webhookDelivery_db');

module.exports = conn.model('WebhookDelivery', webhookDeliverySchema);
