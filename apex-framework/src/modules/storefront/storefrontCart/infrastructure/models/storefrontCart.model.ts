const mongoose = require('mongoose');
const { getConnection } = require('../../../../../core/database');

const storefrontCartSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    // TODO: add StorefrontCart-specific fields here
  },
  { timestamps: true }
);

const conn = getConnection(process.env.STOREFRONTCART_DB_NAME || 'storefrontCart_db');

module.exports = conn.model('StorefrontCart', storefrontCartSchema);
