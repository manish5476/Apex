const mongoose = require('mongoose');
const { getConnection } = require('../../../../../core/database');

const storefrontCartItemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    // TODO: add StorefrontCartItem-specific fields here
  },
  { timestamps: true }
);

const conn = getConnection(process.env.STOREFRONTCARTITEM_DB_NAME || 'storefrontCartItem_db');

module.exports = conn.model('StorefrontCartItem', storefrontCartItemSchema);
