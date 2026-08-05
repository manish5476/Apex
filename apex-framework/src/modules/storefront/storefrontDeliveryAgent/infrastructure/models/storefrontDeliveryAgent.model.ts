const mongoose = require('mongoose');
const { getConnection } = require('../../../../../core/database');

const storefrontDeliveryAgentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    // TODO: add StorefrontDeliveryAgent-specific fields here
  },
  { timestamps: true }
);

const conn = getConnection(process.env.STOREFRONTDELIVERYAGENT_DB_NAME || 'storefrontDeliveryAgent_db');

module.exports = conn.model('StorefrontDeliveryAgent', storefrontDeliveryAgentSchema);
