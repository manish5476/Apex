'use strict';

const mongoose = require('mongoose');

const moneySnapshotSchema = new mongoose.Schema({
  name: { type: String, required: true },
  slug: { type: String },
  image: { type: String },
  sku: { type: String },
  variantTitle: { type: String },
  sellingPrice: { type: Number, required: true },
  discountedPrice: { type: Number },
  taxRate: { type: Number, default: 0 },
  isTaxInclusive: { type: Boolean, default: false },
  currency: { type: String, default: 'INR' }
}, { _id: false });

const storefrontCartItemSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  storefrontId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
  cartId: { type: mongoose.Schema.Types.ObjectId, ref: 'StorefrontCart', required: true, index: true },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'StorefrontCustomer', default: null, index: true },
  sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'StorefrontSession', default: null, index: true },

  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  variantId: { type: mongoose.Schema.Types.ObjectId, default: null },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null },
  snapshot: { type: moneySnapshotSchema, required: true },
  quantity: { type: Number, required: true, min: 1, default: 1 },
  reservedUntil: { type: Date, default: null },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });

storefrontCartItemSchema.index({ organizationId: 1, cartId: 1, productId: 1, variantId: 1, branchId: 1 });

storefrontCartItemSchema.virtual('unitPrice').get(function () {
  return this.snapshot.discountedPrice ?? this.snapshot.sellingPrice;
});

storefrontCartItemSchema.virtual('lineTotal').get(function () {
  return Number(((this.snapshot.discountedPrice ?? this.snapshot.sellingPrice) * this.quantity).toFixed(2));
});

module.exports = mongoose.model('StorefrontCartItem', storefrontCartItemSchema);
