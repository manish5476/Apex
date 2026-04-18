const mongoose = require('mongoose');

const addressSchema = new mongoose.Schema({
  street: { type: String, trim: true },
  city: { type: String, trim: true },
  state: { type: String, trim: true },
  zipCode: { type: String, trim: true },
  country: { type: String, trim: true, default: 'India' },
}, { _id: false });

const customerSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },

  type: {
    type: String,
    enum: ['individual', 'business'],
    default: 'individual',
  },

  name: { type: String, required: [true, 'Customer name is required'], trim: true },
  avatar: { type: String, default: null },
  avatarAsset: { type: mongoose.Schema.Types.ObjectId, ref: 'Asset' },
  contactPerson: { type: String, trim: true },

  email: { type: String, trim: true, lowercase: true, default: null },
  phone: { type: String, trim: true, required: [true, 'Customer phone number is required'] },
  altPhone: { type: String, trim: true, default: null },

  gstNumber: { type: String, trim: true, uppercase: true, default: null },
  panNumber: { type: String, trim: true, uppercase: true, default: null },

  billingAddress: addressSchema,
  shippingAddress: addressSchema,

  openingBalance: { type: Number, default: 0 },

  // FIX #1 — outstandingBalance is a CACHED / DENORMALIZED field.
  // It must NOT be used as the source of truth for AR reporting.
  // The authoritative balance is always computed from AccountEntry debits/credits.
  // This field is updated by: Payment post-save hooks, Invoice post-save hooks,
  // and a periodic reconciliation job. Stale values here are a known risk.
  outstandingBalance: { type: Number, default: 0 },

  creditLimit: { type: Number, default: 0 },
  paymentTerms: { type: String, trim: true },

  // Denormalized stats — same caveat as outstandingBalance above.
  // Must be updated by invoice/payment hooks to stay accurate.
  totalPurchases: { type: Number, default: 0 },
  invoiceCount: { type: Number, default: 0 },
  lastInvoiceAmount: { type: Number, default: 0 },
  lastPurchaseDate: { type: Date },

  isActive: { type: Boolean, default: true },
  isDeleted: { type: Boolean, default: false },

  tags: [{ type: String, trim: true }],
  notes: { type: String, trim: true },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

}, { timestamps: true });

// ─────────────────────────────────────────────
//  Indexes
// ─────────────────────────────────────────────
customerSchema.index({ organizationId: 1, phone: 1 }, { unique: true });
customerSchema.index({ organizationId: 1, name: 1 });
customerSchema.index({ organizationId: 1, outstandingBalance: -1 });
// FIX #2 — Added isActive/isDeleted index for the standard customer list query
customerSchema.index({ organizationId: 1, isActive: 1, isDeleted: 1 });

// Sparse unique indexes (allow multiple nulls)
customerSchema.index({ organizationId: 1, gstNumber: 1 }, { unique: true, partialFilterExpression: { gstNumber: { $gt: '' } } });
customerSchema.index({ organizationId: 1, panNumber: 1 }, { unique: true, partialFilterExpression: { panNumber: { $gt: '' } } });
customerSchema.index({ organizationId: 1, email: 1 }, { unique: true, partialFilterExpression: { email: { $gt: '' } } });
customerSchema.index({ organizationId: 1, altPhone: 1 }, { unique: true, partialFilterExpression: { altPhone: { $gt: '' } } });

// ─────────────────────────────────────────────
//  Virtuals
// ─────────────────────────────────────────────
customerSchema.virtual('displayName').get(function () {
  return this.type === 'business' && this.contactPerson
    ? `${this.name} (${this.contactPerson})`
    : this.name;
});

// ─────────────────────────────────────────────
//  Pre-Save Middleware
// ─────────────────────────────────────────────
customerSchema.pre('save', function (next) {
  const sanitize = (field) => {
    if (this[field] !== undefined && typeof this[field] === 'string') {
      const trimmed = this[field].trim();
      this[field] = trimmed.length > 0 ? trimmed : null;
    }
  };
  sanitize('gstNumber');
  sanitize('panNumber');
  sanitize('email');
  sanitize('altPhone');

  if (this.tags) {
    this.tags = this.tags.filter(t => t && t.trim().length > 0);
  }

  // FIX #3 — Guard: creditLimit should never be negative
  if (this.creditLimit < 0) {
    return next(new Error('creditLimit cannot be negative'));
  }

  next();
});

const Customer = mongoose.model('Customer', customerSchema);
module.exports = Customer;

