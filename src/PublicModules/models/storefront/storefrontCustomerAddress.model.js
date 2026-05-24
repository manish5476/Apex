'use strict';

const mongoose = require('mongoose');

const storefrontCustomerAddressSchema = new mongoose.Schema({
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'StorefrontCustomer', required: true, index: true },
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  storefrontId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },

  fullName: { type: String, trim: true, required: true },
  phone: { type: String, trim: true, required: true },
  country: { type: String, trim: true, default: 'India' },
  state: { type: String, trim: true, required: true },
  city: { type: String, trim: true, required: true },
  postalCode: { type: String, trim: true, required: true },
  addressLine1: { type: String, trim: true, required: true },
  addressLine2: { type: String, trim: true, default: '' },
  landmark: { type: String, trim: true, default: '' },
  addressType: {
    type: String,
    enum: ['home', 'work', 'billing', 'shipping', 'other'],
    default: 'home'
  },
  isDefault: { type: Boolean, default: false, index: true }
}, { timestamps: true });

storefrontCustomerAddressSchema.index({ organizationId: 1, customerId: 1, isDefault: 1 });

module.exports = mongoose.model('StorefrontCustomerAddress', storefrontCustomerAddressSchema);
