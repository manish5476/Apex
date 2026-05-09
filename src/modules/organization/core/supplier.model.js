const mongoose = require('mongoose');

// ===================================================
//  Sub-Schemas
// ===================================================
const addressSchema = new mongoose.Schema({
  street: { type: String, trim: true },
  city: { type: String, trim: true },
  state: { type: String, trim: true },
  zipCode: { type: String, trim: true },
  country: { type: String, trim: true, default: 'India' },
}, { _id: false });

const contactSchema = new mongoose.Schema({
  name: { type: String, trim: true },
  department: {
    type: String,
    enum: ['Sales', 'Accounts', 'Support', 'Management', 'Other'],
    default: 'Other',
  },
  phone: { type: String, trim: true },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    default: null,
    match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address']
  },
  isPrimary: { type: Boolean, default: false },
}, { _id: true }); // _id: true so we can target individual contacts for updates/deletes

const documentSchema = new mongoose.Schema({
  docType: {
    type: String,
    required: true,
    enum: ['GST', 'PAN', 'MSME', 'TradeLicense', 'Aadhaar', 'Other'],
  },
  url: { type: String, required: true },
  public_id: { type: String },   // legacy Cloudinary ID (kept for fallback)
  assetId: { type: mongoose.Schema.Types.ObjectId, ref: 'Asset' }, // master asset link
  uploadedAt: { type: Date, default: Date.now },
  verified: { type: Boolean, default: false },
}, { _id: true }); // _id: true — used for safe targeted deletion via $pull

const bankDetailsSchema = new mongoose.Schema({
  accountName: { type: String, trim: true },
  accountNumber: { type: String, trim: true },
  bankName: { type: String, trim: true },
  ifscCode: { type: String, trim: true, uppercase: true },
  branch: { type: String, trim: true },
}, { _id: false });

// ===================================================
//  Main Supplier Schema
// ===================================================
const supplierSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },

    avatar: { type: String },

    companyName: {
      type: String,
      required: [true, 'Supplier company name is required'],
      trim: true,
    },

    // --- 1. CRM / CONTACTS ---
    contactPerson: { type: String, trim: true }, // kept for backward compat
    contacts: [contactSchema],
    category: { type: String, trim: true }, // legacy string — kept for backward compat
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Master', index: true, default: null }, // preferred: links to Master list
    tags: [{ type: String, trim: true }],

    // --- 2. BASIC CONTACT INFO ---
    email: { type: String, trim: true, lowercase: true, default: null },
    phone: { type: String, trim: true, default: null },
    altPhone: { type: String, trim: true },
    address: addressSchema,

    // --- 3. FINANCIAL & COMPLIANCE ---
    gstNumber: { type: String, trim: true, uppercase: true, default: null },
    panNumber: { type: String, trim: true, uppercase: true, default: null },

    openingBalance: { type: Number, default: 0 },

    // DENORMALIZED CACHE — not source of truth.
    // Authoritative balance = openingBalance + sum(Purchase.grandTotal) - sum(Payment.amount)
    // Updated by: Payment post-save hooks, Purchase post-save hooks, periodic reconciliation.
    // Do NOT use this field for financial reporting — always recompute from ledger entries.
    outstandingBalance: { type: Number, default: 0 },

    paymentTerms: { type: String, trim: true }, // e.g. 'Net 30'
    creditLimit: { type: Number, default: 0 }, // 0 = unlimited

    bankDetails: bankDetailsSchema,
    documents: [documentSchema],

    // --- 4. SYSTEM ---
    branchesSupplied: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Branch' }],
    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

// ===================================================
//  Indexes
// ===================================================
// Partial unique indexes — allow multiple nulls, enforce uniqueness on real values
supplierSchema.index(
  { organizationId: 1, email: 1 },
  { unique: true, partialFilterExpression: { email: { $gt: '' } } }
);
supplierSchema.index(
  { organizationId: 1, phone: 1 },
  { unique: true, partialFilterExpression: { phone: { $gt: '' } } }
);
supplierSchema.index(
  { organizationId: 1, gstNumber: 1 },
  { unique: true, partialFilterExpression: { gstNumber: { $gt: '' } } }
);

supplierSchema.index({ organizationId: 1, companyName: 1 });
supplierSchema.index({ organizationId: 1, isActive: 1, isDeleted: 1 });

// ===================================================
//  Virtuals
// ===================================================
supplierSchema.virtual('displayName').get(function () {
  return this.contactPerson
    ? `${this.companyName} (${this.contactPerson})`
    : this.companyName;
});

// ===================================================
//  Pre-Save: Data Cleanup
// ===================================================
supplierSchema.pre(/^find/, function (next) {
  this.find({ isDeleted: { $ne: true } });
  next();
});

supplierSchema.pre(['updateOne', 'findOneAndUpdate'], function (next) {
  const update = this.getUpdate();

  next();
});
supplierSchema.pre('save', function (next) {
  if (this.companyName) this.companyName = this.companyName.trim();
  if (this.contactPerson) this.contactPerson = this.contactPerson.trim();
  ['email', 'phone', 'gstNumber', 'panNumber'].forEach(field => {
    if (this[field] === '') this[field] = null;
  });
  if (this.creditLimit < 0) {
    return next(new Error('creditLimit cannot be negative'));
  }

  next();
});

const Supplier = mongoose.model('Supplier', supplierSchema);
module.exports = Supplier;


