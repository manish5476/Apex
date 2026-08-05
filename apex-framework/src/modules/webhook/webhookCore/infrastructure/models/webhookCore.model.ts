const mongoose = require('mongoose');
const { getConnection } = require('../../../../../core/database');

const webhookCoreSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    // TODO: add WebhookCore-specific fields here
  },
  { timestamps: true }
);

const conn = getConnection(process.env.WEBHOOKCORE_DB_NAME || 'webhookCore_db');

module.exports = conn.model('WebhookCore', webhookCoreSchema);
