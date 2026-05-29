'use strict';

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const storefrontDeliveryAgentSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  
  // Link to CRM staff member, if this agent is an internal staff
  staffId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

  name: { type: String, required: true, trim: true },
  phone: { type: String, required: true, trim: true },
  email: { type: String, trim: true, lowercase: true, default: null },
  
  // Login credentials for the standalone /delivery portal
  password: { type: String, required: true, select: false },

  vehicleType: { type: String, trim: true, default: 'Bike' },
  vehicleRegistrationNumber: { type: String, trim: true, default: '' },
  
  isActive: { type: Boolean, default: true },

  // Currently assigned active orders
  assignedOrders: [{ type: mongoose.Schema.Types.ObjectId, ref: 'StorefrontOrder' }],

  lastActiveAt: { type: Date, default: null },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });

storefrontDeliveryAgentSchema.index({ organizationId: 1, phone: 1 }, { unique: true });
storefrontDeliveryAgentSchema.index({ organizationId: 1, email: 1 });

// Hash password before saving
storefrontDeliveryAgentSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    next(err);
  }
});

// Method to verify password
storefrontDeliveryAgentSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('StorefrontDeliveryAgent', storefrontDeliveryAgentSchema);
