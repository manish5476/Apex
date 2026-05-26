'use strict';

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const recentlyViewedSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  viewedAt: { type: Date, default: Date.now }
}, { _id: false });

const storefrontCustomerSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  storefrontId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },

  email: { type: String, trim: true, lowercase: true, default: null },
  phone: { type: String, trim: true, default: null },
  firstName: { type: String, trim: true, default: '' },
  lastName: { type: String, trim: true, default: '' },
  avatar: { type: String, default: null },

  authProvider: {
    type: String,
    enum: ['guest', 'password', 'google', 'facebook', 'apple', 'otp'],
    default: 'guest',
    index: true
  },
  passwordHash: { type: String, select: false },
  passwordResetToken: { type: String, select: false },
  passwordResetExpires: { type: Date, select: false },
  guestAccount: { type: Boolean, default: true, index: true },
  marketingOptIn: { type: Boolean, default: false },

  tags: [{ type: String, trim: true }],
  notes: { type: String, trim: true, default: '' },
  status: {
    type: String,
    enum: ['active', 'blocked', 'deleted'],
    default: 'active',
    index: true
  },

  lastSeenAt: { type: Date, default: Date.now },
  lastOrderAt: { type: Date, default: null },
  orderCount: { type: Number, default: 0, min: 0 },
  totalSpent: { type: Number, default: 0, min: 0 },

  convertedToMainCustomer: { type: Boolean, default: false, index: true },
  linkedCustomerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null, index: true },
  defaultAddressId: { type: mongoose.Schema.Types.ObjectId, ref: 'StorefrontCustomerAddress', default: null },

  wishlist: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
  recentlyViewed: { type: [recentlyViewedSchema], default: [] },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });

storefrontCustomerSchema.index(
  { organizationId: 1, email: 1 },
  { unique: true, partialFilterExpression: { email: { $type: 'string', $gt: '' } } }
);
storefrontCustomerSchema.index(
  { organizationId: 1, phone: 1 },
  { unique: true, partialFilterExpression: { phone: { $type: 'string', $gt: '' } } }
);
storefrontCustomerSchema.index({ organizationId: 1, guestAccount: 1, updatedAt: -1 });
storefrontCustomerSchema.index({ organizationId: 1, convertedToMainCustomer: 1, updatedAt: -1 });

storefrontCustomerSchema.virtual('fullName').get(function () {
  return [this.firstName, this.lastName].filter(Boolean).join(' ').trim();
});

storefrontCustomerSchema.methods.setPassword = async function (plainPassword) {
  this.passwordHash = await bcrypt.hash(plainPassword, 12);
  this.guestAccount = false;
  this.authProvider = 'password';
};

storefrontCustomerSchema.methods.comparePassword = async function (candidatePassword) {
  if (!this.passwordHash) return false;
  return bcrypt.compare(candidatePassword, this.passwordHash);
};

storefrontCustomerSchema.methods.createPasswordResetToken = function () {
  const resetToken = crypto.randomBytes(32).toString('hex');

  this.passwordResetToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');

  this.passwordResetExpires = Date.now() + 10 * 60 * 1000;

  return resetToken;
};

storefrontCustomerSchema.pre('save', function (next) {
  if (Array.isArray(this.tags)) {
    this.tags = this.tags.map(tag => String(tag).trim()).filter(Boolean);
  }
  next();
});

module.exports = mongoose.model('StorefrontCustomer', storefrontCustomerSchema);
