'use strict';

const mongoose = require('mongoose');

const storefrontCouponSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  
  code: { type: String, trim: true, uppercase: true, required: true },
  discountType: { 
    type: String, 
    enum: ['fixed', 'percentage', 'shipping'], 
    default: 'fixed' 
  },
  amount: { type: Number, required: true, default: 0 },
  maxDiscount: { type: Number, default: null }, // Cap on discount amount for percentage coupons
  minPurchaseAmount: { type: Number, default: 0 }, // Minimum order subtotal required to apply
  
  startDate: { type: Date, default: null },
  endDate: { type: Date, default: null },
  
  usageLimit: { type: Number, default: null }, // Total times this coupon can be used
  usedCount: { type: Number, default: 0 },
  
  isActive: { type: Boolean, default: true, index: true }
}, { timestamps: true });

// A coupon code must be unique within an organization
storefrontCouponSchema.index({ organizationId: 1, code: 1 }, { unique: true });

module.exports = mongoose.model('StorefrontCoupon', storefrontCouponSchema);
