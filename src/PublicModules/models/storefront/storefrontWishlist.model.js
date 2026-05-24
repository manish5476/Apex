'use strict';

const mongoose = require('mongoose');

const storefrontWishlistSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  storefrontId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'StorefrontCustomer', required: true, index: true },
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  variantId: { type: mongoose.Schema.Types.ObjectId, default: null },
  addedAt: { type: Date, default: Date.now },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });

storefrontWishlistSchema.index({ organizationId: 1, customerId: 1, productId: 1, variantId: 1 }, { unique: true });

module.exports = mongoose.model('StorefrontWishlist', storefrontWishlistSchema);
