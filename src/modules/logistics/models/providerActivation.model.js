'use strict';

const mongoose = require('mongoose');

const providerActivationSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  businessId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
  storeId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
  warehouseId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
  partnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'GlobalDeliveryPartner', required: true, index: true },
  status: { type: String, enum: ['draft', 'active', 'paused', 'revoked'], default: 'draft', index: true },
  priorityRank: { type: Number, default: 100, index: true },
  fallbackEnabled: { type: Boolean, default: true },
  serviceLevels: [{ type: String, enum: ['standard', 'express', 'same_day', 'scheduled'] }],
  regionRules: { type: mongoose.Schema.Types.Mixed, default: {} },
  pricingConfig: { type: mongoose.Schema.Types.Mixed, default: {} },
  slaConfig: { type: mongoose.Schema.Types.Mixed, default: {} },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });

providerActivationSchema.index({ organizationId: 1, partnerId: 1, storeId: 1 }, { unique: true });
providerActivationSchema.index({ organizationId: 1, status: 1, priorityRank: 1 });

module.exports = mongoose.model('LogisticsProviderActivation', providerActivationSchema);
