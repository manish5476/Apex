const mongoose = require('mongoose');
const { getConnection } = require('../../../../../core/database');

const storefrontOrderSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    // TODO: add StorefrontOrder-specific fields here
  },
  { timestamps: true }
);

const conn = getConnection(process.env.STOREFRONTORDER_DB_NAME || 'storefrontOrder_db');

module.exports = conn.model('StorefrontOrder', storefrontOrderSchema);
