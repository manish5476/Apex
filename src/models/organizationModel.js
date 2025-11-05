// src/models/organizationModel.js
const mongoose = require('mongoose');

const organizationSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Organization name is required'],
    trim: true,
  },

  uniqueShopId: {
    type: String,
    required: [true, 'A unique Shop ID is required'],
    unique: true,
    uppercase: true,
    trim: true,
  },

  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },

  members: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }],

  // 🟢 Pending approval requests
  approvalRequests: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    email: String,
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    requestedAt: { type: Date, default: Date.now },
  }],

  // --- Business Details ---
  gstNumber: { type: String, trim: true, uppercase: true },
  primaryEmail: {
    type: String,
    required: [true, 'Primary email is required'],
    trim: true,
    lowercase: true,
  },
  secondaryEmail: { type: String, trim: true, lowercase: true },
  primaryPhone: {
    type: String,
    required: [true, 'Primary phone number is required'],
    trim: true,
  },
  secondaryPhone: { type: String, trim: true },

  // --- Organization hierarchy ---
  mainBranch: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Branch',
  },
  branches: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Branch',
  }],

  // --- Meta ---
  superAdminRole: {
    type: String,
    default: 'superadmin',
  },
  isActive: {
    type: Boolean,
    default: true,
  },
}, { timestamps: true });

// --- Hooks / Middleware ---
// Automatically add owner as first member when creating the organization
organizationSchema.pre('save', function (next) {
  if (this.isNew && this.owner && !this.members.includes(this.owner)) {
    this.members.push(this.owner);
  }
  next();
});

const Organization = mongoose.model('Organization', organizationSchema);
module.exports = Organization;
