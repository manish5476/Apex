const mongoose = require('mongoose');

const addressSchema = new mongoose.Schema({
  street: { type: String, trim: true },
  city: { type: String, trim: true },
  state: { type: String, trim: true },
  zipCode: { type: String, trim: true },
  country: { type: String, trim: true, default: 'India' },
}, { _id: false });

const customerSchema = new mongoose.Schema({
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true,
  },
  type: {
    type: String,
    enum: ['individual', 'business'],
    default: 'individual',
  },
  name: {
    type: String,
    required: [true, 'Customer name is required'],
    trim: true,
  },
  avatar: { type: String, trim: true },
  contactPerson: { type: String, trim: true },
  email: { type: String, trim: true, lowercase: true, default: null },
  phone: {
    type: String,
    trim: true,
    required: [true, 'Customer phone number is required'],
  },
  altPhone: { type: String, trim: true, default: null },
  gstNumber: { type: String, trim: true, uppercase: true, default: null },
  panNumber: { type: String, trim: true, uppercase: true, default: null },

  billingAddress: addressSchema,
  shippingAddress: addressSchema,

  // --- Financials ---
  openingBalance: { type: Number, default: 0 },
  outstandingBalance: { type: Number, default: 0 },
  creditLimit: { type: Number, default: 0 },
  paymentTerms: { type: String, trim: true },

  // --- Analytics (REQUIRED for Invoice Controller) ---
  totalPurchases: { type: Number, default: 0 },     // Sum of all invoice grandTotals
  invoiceCount: { type: Number, default: 0 },       // Count of invoices
  lastInvoiceAmount: { type: Number, default: 0 },  // Value of the most recent invoice
  lastPurchaseDate: { type: Date },                 // Date of most recent purchase

  isActive: { type: Boolean, default: true },
  isDeleted: { type: Boolean, default: false },
  tags: [{ type: String, trim: true }],
  notes: { type: String, trim: true },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

// Indexes
customerSchema.index({ organizationId: 1, phone: 1 }, { unique: true });
customerSchema.index({ organizationId: 1, name: 1 });
customerSchema.index({ organizationId: 1, outstandingBalance: -1 });

// Sparse Unique Indexes
customerSchema.index({ organizationId: 1, gstNumber: 1 }, { unique: true, partialFilterExpression: { gstNumber: { $gt: "" } } });
customerSchema.index({ organizationId: 1, panNumber: 1 }, { unique: true, partialFilterExpression: { panNumber: { $gt: "" } } });
customerSchema.index({ organizationId: 1, email: 1 }, { unique: true, partialFilterExpression: { email: { $gt: "" } } });
customerSchema.index({ organizationId: 1, altPhone: 1 }, { unique: true, partialFilterExpression: { altPhone: { $gt: "" } } });

// Virtuals & Middleware
customerSchema.virtual('displayName').get(function () {
  return this.type === 'business' && this.contactPerson ? `${this.name} (${this.contactPerson})` : this.name;
});

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
  if (this.tags) this.tags = this.tags.filter(t => t && t.trim().length > 0);
  next();
});

const Customer = mongoose.model('Customer', customerSchema);
module.exports = Customer;

// const mongoose = require('mongoose');

// const addressSchema = new mongoose.Schema({
//   street: { type: String, trim: true },
//   city: { type: String, trim: true },
//   state: { type: String, trim: true },
//   zipCode: { type: String, trim: true },
//   country: { type: String, trim: true, default: 'India' },
// }, { _id: false });

// const customerSchema = new mongoose.Schema({
//   organizationId: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: 'Organization',
//     required: true,
//     index: true,
//   },
//   type: {
//     type: String,
//     enum: ['individual', 'business'],
//     default: 'individual',
//   },
//   name: {
//     type: String,
//     required: [true, 'Customer name is required'],
//     trim: true,
//   },
//   avatar: { type: String, trim: true },
//   contactPerson: { type: String, trim: true },
//   email: { type: String, trim: true, lowercase: true, default: null },
//   phone: {
//     type: String,
//     trim: true,
//     required: [true, 'Customer phone number is required'],
//   },
//   altPhone: { type: String, trim: true, default: null },
//   gstNumber: { type: String, trim: true, uppercase: true, default: null },
//   panNumber: { type: String, trim: true, uppercase: true, default: null },

//   billingAddress: addressSchema,
//   shippingAddress: addressSchema,

//   openingBalance: { type: Number, default: 0 },
//   outstandingBalance: { type: Number, default: 0 },
//   creditLimit: { type: Number, default: 0 },
//   paymentTerms: { type: String, trim: true },

//   isActive: { type: Boolean, default: true },
//   isDeleted: { type: Boolean, default: false },
//   tags: [{ type: String, trim: true }],
//   notes: { type: String, trim: true },

//   createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
//   updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
// }, { timestamps: true });

// // ======================================================
// // 🔑 INDEXES (THE FINAL FIX)
// // ======================================================

// // 1. Phone is required, so standard unique per Org
// customerSchema.index({ organizationId: 1, phone: 1 }, { unique: true });
// customerSchema.index({ organizationId: 1, name: 1 });
// customerSchema.index({ organizationId: 1, outstandingBalance: -1 });

// /**
//  * We use { $gt: "" } in the partial filter.
//  * This tells MongoDB: "Only enforce uniqueness if the string is NOT empty".
//  * This allows multiple customers to have an empty string or null.
//  */

// // GST Number
// customerSchema.index(
//   { organizationId: 1, gstNumber: 1 }, 
//   { 
//     unique: true, 
//     partialFilterExpression: { gstNumber: { $gt: "" } } 
//   }
// );

// // PAN Number
// customerSchema.index(
//   { organizationId: 1, panNumber: 1 }, 
//   { 
//     unique: true, 
//     partialFilterExpression: { panNumber: { $gt: "" } } 
//   }
// );

// // Email
// customerSchema.index(
//   { organizationId: 1, email: 1 }, 
//   { 
//     unique: true, 
//     partialFilterExpression: { email: { $gt: "" } } 
//   }
// );

// // Alt Phone
// customerSchema.index(
//   { organizationId: 1, altPhone: 1 }, 
//   { 
//     unique: true, 
//     partialFilterExpression: { altPhone: { $gt: "" } } 
//   }
// );

// // Virtuals & Middleware
// customerSchema.virtual('displayName').get(function () {
//   return this.type === 'business' && this.contactPerson ? `${this.name} (${this.contactPerson})` : this.name;
// });

// customerSchema.pre('save', function (next) {
//   const sanitize = (field) => {
//     if (this[field] !== undefined && typeof this[field] === 'string') {
//       const trimmed = this[field].trim();
//       this[field] = trimmed.length > 0 ? trimmed : null;
//     }
//   };
//   sanitize('gstNumber');
//   sanitize('panNumber');
//   sanitize('email');
//   sanitize('altPhone');
//   if (this.tags) this.tags = this.tags.filter(t => t && t.trim().length > 0);
//   next();
// });

// const Customer = mongoose.model('Customer', customerSchema);
// module.exports = Customer;
