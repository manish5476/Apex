'use strict';

const mongoose = require('mongoose');

const partnerSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, index: true },
  slug: { type: String, required: true, trim: true, lowercase: true, unique: true },
  legalName: { type: String, trim: true, default: '' },
  status: { type: String, enum: ['draft', 'verification_pending', 'active', 'paused', 'suspended'], default: 'draft', index: true },
  providerType: {
    type: String,
    enum: ['courier', 'hyperlocal', 'fleet_operator', 'gig_network', 'regional_agency', 'third_party_api'],
    default: 'courier',
    index: true
  },
  contact: {
    email: { type: String, trim: true, lowercase: true, default: '' },
    phone: { type: String, trim: true, default: '' },
    website: { type: String, trim: true, default: '' }
  },
  capabilities: {
    pickup: { type: Boolean, default: true },
    lastMile: { type: Boolean, default: true },
    hyperlocal: { type: Boolean, default: false },
    scheduled: { type: Boolean, default: false },
    cod: { type: Boolean, default: false },
    returns: { type: Boolean, default: false },
    batchDelivery: { type: Boolean, default: false },
    routeOptimization: { type: Boolean, default: false },
    webhookTracking: { type: Boolean, default: false }
  },
  qualityScore: { type: Number, default: 0, min: 0, max: 100, index: true },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });

partnerSchema.index({ status: 1, providerType: 1, qualityScore: -1 });

module.exports = mongoose.model('GlobalDeliveryPartner', partnerSchema);
