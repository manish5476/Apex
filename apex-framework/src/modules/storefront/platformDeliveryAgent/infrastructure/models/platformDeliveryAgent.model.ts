const mongoose = require('mongoose');
const { getConnection } = require('../../../../../core/database');

const platformDeliveryAgentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    // TODO: add PlatformDeliveryAgent-specific fields here
  },
  { timestamps: true }
);

const conn = getConnection(process.env.PLATFORMDELIVERYAGENT_DB_NAME || 'platformDeliveryAgent_db');

module.exports = conn.model('PlatformDeliveryAgent', platformDeliveryAgentSchema);
