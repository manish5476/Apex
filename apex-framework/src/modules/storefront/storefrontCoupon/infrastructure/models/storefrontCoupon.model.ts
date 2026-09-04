const mongoose = require('mongoose');
const { getConnection } = require('../../../../../core/database');

const storefrontCouponSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    // TODO: add StorefrontCoupon-specific fields here
  },
  { timestamps: true }
);

const conn = getConnection(process.env.STOREFRONTCOUPON_DB_NAME || 'storefrontCoupon_db');

module.exports = conn.model('StorefrontCoupon', storefrontCouponSchema);
