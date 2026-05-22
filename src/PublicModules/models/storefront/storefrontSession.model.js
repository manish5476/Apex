'use strict';

const mongoose = require('mongoose');

const storefrontSessionSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  storefrontId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'StorefrontCustomer', default: null, index: true },
  sessionTokenHash: { type: String, required: true, index: true },
  guest: { type: Boolean, default: true, index: true },
  userAgent: { type: String, default: '' },
  ipAddress: { type: String, default: '' },
  lastSeenAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });

storefrontSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
storefrontSessionSchema.index({ organizationId: 1, customerId: 1, expiresAt: 1 });

module.exports = mongoose.model('StorefrontSession', storefrontSessionSchema);
