const mongoose = require('mongoose');

// ===================================================
//  Sub-Schemas (For clean embedding)
// ===================================================
const addressSchema = new mongoose.Schema({
  street: { type: String, trim: true },
  city: { type: String, trim: true },
  state: { type: String, trim: true },
  zipCode: { type: String, trim: true },
  country: { type: String, trim: true, default: 'India' },
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

    // --- 1. OPERATIONAL & CRM FEATURES ---
    contactPerson: { type: String, trim: true }, // Kept for quick/backward compatibility
    contacts: [{
      name: { type: String, trim: true },
      department: { 
        type: String, 
        enum: ['Sales', 'Accounts', 'Support', 'Management', 'Other'],
        default: 'Other'
      },
      phone: { type: String, trim: true },
      email: { type: String, trim: true, lowercase: true },
      isPrimary: { type: Boolean, default: false }
    }],
    category: { type: String, trim: true }, 
    tags: [{ type: String, trim: true }],

    // --- 2. BASIC CONTACT INFO ---
    email: { type: String, trim: true, lowercase: true, default: null },
    phone: { type: String, trim: true, default: null },
    altPhone: { type: String, trim: true },
    address: addressSchema,

    // --- 3. FINANCIAL & COMPLIANCE FEATURES ---
    gstNumber: { type: String, trim: true, uppercase: true, default: null },
    panNumber: { type: String, trim: true, uppercase: true, default: null },
    
    openingBalance: { type: Number, default: 0 },
    outstandingBalance: { type: Number, default: 0 },
    paymentTerms: { type: String, trim: true }, // e.g., 'Net 30'
    
    // NEW: Credit Guard Limit
    creditLimit: { type: Number, default: 0 }, // 0 means unlimited credit
    
    // NEW: Bank Details for Payouts
    bankDetails: {
      accountName: { type: String, trim: true },
      accountNumber: { type: String, trim: true },
      bankName: { type: String, trim: true },
      ifscCode: { type: String, trim: true, uppercase: true },
      branch: { type: String, trim: true }
    },

    // NEW: KYC Documents (Cloudinary)
    documents: [{
      docType: { type: String, required: true },
      url: { type: String, required: true },
      public_id: { type: String },
      uploadedAt: { type: Date, default: Date.now },
      verified: { type: Boolean, default: false }
    }],

    // --- 4. SYSTEM FIELDS ---
    branchesSupplied: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Branch' }],
    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

/* ===================================================
    🔥 Partial Indexes (Allows multiple null values)
==================================================== */
supplierSchema.index(
  { organizationId: 1, email: 1 },
  { 
    unique: true, 
    partialFilterExpression: { email: { $gt: "" } } 
  }
);

supplierSchema.index(
  { organizationId: 1, phone: 1 },
  { 
    unique: true, 
    partialFilterExpression: { phone: { $gt: "" } } 
  }
);

supplierSchema.index(
  { organizationId: 1, gstNumber: 1 },
  { 
    unique: true, 
    partialFilterExpression: { gstNumber: { $gt: "" } } 
  }
);

supplierSchema.index({ organizationId: 1, companyName: 1 });

/* ===================================================
    🔥 Virtuals
==================================================== */
supplierSchema.virtual('displayName').get(function () {
  return this.contactPerson ? `${this.companyName} (${this.contactPerson})` : this.companyName;
});

/* ===================================================
    🔥 Pre-Save Middleware (Data Cleanup)
==================================================== */
supplierSchema.pre('save', function (next) {
  // Trim standard strings
  if (this.companyName) this.companyName = this.companyName.trim();
  if (this.contactPerson) this.contactPerson = this.contactPerson.trim();
  
  // Convert empty strings to null for unique indexed fields
  const fields = ['email', 'phone', 'gstNumber', 'panNumber'];
  fields.forEach(field => {
    if (this[field] === "") this[field] = null;
  });
  
  next();
});

const Supplier = mongoose.model('Supplier', supplierSchema);
module.exports = Supplier;

// const mongoose = require('mongoose');
// const addressSchema = new mongoose.Schema({
//   street: { type: String, trim: true },
//   city: { type: String, trim: true },
//   state: { type: String, trim: true },
//   zipCode: { type: String, trim: true },
//   country: { type: String, trim: true, default: 'India' },
// }, { _id: false });
// const supplierSchema = new mongoose.Schema(
//   {
//     organizationId: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: 'Organization',
//       required: true,
//       index: true,
//     },
//     avatar: { type: String },
//     companyName: {
//       type: String,
//       required: [true, 'Supplier company name is required'],
//       trim: true,
//     },
//     contactPerson: { type: String, trim: true },
//     contacts: [{
//     name: String,
//     department: { type: String, enum: ['Sales', 'Accounts', 'Support', 'Management'] },
//     phone: String,
//     email: String,
//     isPrimary: Boolean
// }],
//     email: { type: String, trim: true, lowercase: true, default: null },
//     phone: { type: String, trim: true, default: null },
//     altPhone: { type: String, trim: true },
//     gstNumber: { type: String, trim: true, uppercase: true, default: null },
//     panNumber: { type: String, trim: true, uppercase: true, default: null },

//     address: addressSchema,
//     openingBalance: { type: Number, default: 0 },
//     outstandingBalance: { type: Number, default: 0 },
//     paymentTerms: { type: String, trim: true },

//     branchesSupplied: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Branch' }],
//     isActive: { type: Boolean, default: true },
//     isDeleted: { type: Boolean, default: false },
//     createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
//     updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
//   },
//   { timestamps: true }
// );

// /* ===================================================
//     🔥 THE FIX: Partial Indexes
// ==================================================== */
// supplierSchema.index(
//   { organizationId: 1, email: 1 },
//   { 
//     unique: true, 
//     partialFilterExpression: { email: { $gt: "" } } 
//   }
// );
// supplierSchema.index(
//   { organizationId: 1, phone: 1 },
//   { 
//     unique: true, 
//     partialFilterExpression: { phone: { $gt: "" } } 
//   }
// );
// supplierSchema.index(
//   { organizationId: 1, gstNumber: 1 },
//   { 
//     unique: true, 
//     partialFilterExpression: { gstNumber: { $gt: "" } } 
//   }
// );
// supplierSchema.index({ organizationId: 1, companyName: 1 });
// supplierSchema.virtual('displayName').get(function () {
//   return this.contactPerson ? `${this.companyName} (${this.contactPerson})` : this.companyName;
// });
// supplierSchema.pre('save', function (next) {
//   if (this.companyName) this.companyName = this.companyName.trim();
//   if (this.contactPerson) this.contactPerson = this.contactPerson.trim();
//   const fields = ['email', 'phone', 'gstNumber', 'panNumber'];
//   fields.forEach(field => {
//     if (this[field] === "") this[field] = null;
//   });
//   next();
// });
// const Supplier = mongoose.model('Supplier', supplierSchema);
// module.exports = Supplier;
