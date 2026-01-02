const mongoose = require('mongoose');

// --- Subdocument for Address ---
const addressSchema = new mongoose.Schema({
  street: { type: String, trim: true },
  city: { type: String, trim: true },
  state: { type: String, trim: true },
  zipCode: { type: String, trim: true },
  country: { type: String, trim: true, default: 'India' },
}, { _id: false });

// --- Main Supplier Schema ---
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
    contactPerson: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true, default: null },
    phone: { type: String, trim: true, default: null },
    altPhone: { type: String, trim: true },
    gstNumber: { type: String, trim: true, uppercase: true, default: null },
    panNumber: { type: String, trim: true, uppercase: true, default: null },

    address: addressSchema,
    openingBalance: { type: Number, default: 0 },
    outstandingBalance: { type: Number, default: 0 },
    paymentTerms: { type: String, trim: true },

    branchesSupplied: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Branch' }],
    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

/* ===================================================
    🔥 THE FIX: Partial Indexes
==================================================== */

// Email Unique per Org (Ignored if null/empty)
supplierSchema.index(
  { organizationId: 1, email: 1 },
  { 
    unique: true, 
    partialFilterExpression: { email: { $gt: "" } } 
  }
);

// Phone Unique per Org (Ignored if null/empty)
supplierSchema.index(
  { organizationId: 1, phone: 1 },
  { 
    unique: true, 
    partialFilterExpression: { phone: { $gt: "" } } 
  }
);

// GST Unique per Org (Ignored if null/empty)
supplierSchema.index(
  { organizationId: 1, gstNumber: 1 },
  { 
    unique: true, 
    partialFilterExpression: { gstNumber: { $gt: "" } } 
  }
);

supplierSchema.index({ organizationId: 1, companyName: 1 });

// --- Virtual for Display Name ---
supplierSchema.virtual('displayName').get(function () {
  return this.contactPerson ? `${this.companyName} (${this.contactPerson})` : this.companyName;
});

// --- Middleware: Normalize Text & Clean Nulls ---
supplierSchema.pre('save', function (next) {
  if (this.companyName) this.companyName = this.companyName.trim();
  if (this.contactPerson) this.contactPerson = this.contactPerson.trim();
  
  // Convert empty strings to null to avoid index collisions
  const fields = ['email', 'phone', 'gstNumber', 'panNumber'];
  fields.forEach(field => {
    if (this[field] === "") this[field] = null;
  });
  
  next();
});

const Supplier = mongoose.model('Supplier', supplierSchema);
module.exports = Supplier;

