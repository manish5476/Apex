'use strict';

const mongoose = require('mongoose');

const amountBreakdownSchema = new mongoose.Schema({
  subtotal: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
  currency: { type: String, default: 'INR' }
}, { _id: false });

const appliedCouponSchema = new mongoose.Schema({
  code: { type: String, trim: true, uppercase: true, required: true },
  discountType: { type: String, enum: ['fixed', 'percentage', 'shipping'], default: 'fixed' },
  amount: { type: Number, default: 0 },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { _id: false });

const storefrontCartSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  storefrontId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },

  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'StorefrontCustomer', default: null, index: true },
  sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'StorefrontSession', default: null, index: true },
  sessionToken: { type: String, select: false }, // Legacy compatibility only; use StorefrontSession for ownership.

  currency: { type: String, default: 'INR' },
  totals: { type: amountBreakdownSchema, default: () => ({}) },
  discountTotals: { type: amountBreakdownSchema, default: () => ({}) },
  shippingTotals: { type: amountBreakdownSchema, default: () => ({}) },
  taxTotals: { type: amountBreakdownSchema, default: () => ({}) },

  cartItems: [{ type: mongoose.Schema.Types.ObjectId, ref: 'StorefrontCartItem' }],
  appliedCoupons: { type: [appliedCouponSchema], default: [] },

  status: {
    type: String,
    enum: ['active', 'merged', 'converted', 'abandoned', 'expired'],
    default: 'active',
    index: true
  },
  abandonedAt: { type: Date, default: null },
  recoverySentAt: { type: Date, default: null },
  notes: { type: String, trim: true, default: '' },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    index: false
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

storefrontCartSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
storefrontCartSchema.index({ organizationId: 1, status: 1, updatedAt: -1 });
storefrontCartSchema.index({ organizationId: 1, customerId: 1, status: 1 });
storefrontCartSchema.index({ organizationId: 1, sessionId: 1, status: 1 });

module.exports = mongoose.model('StorefrontCart', storefrontCartSchema);
