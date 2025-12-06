const mongoose = require('mongoose');

// --- Subdocument for Address ---
const addressSchema = new mongoose.Schema({
  street: { type: String, trim: true },
  city: { type: String, trim: true },
  state: { type: String, trim: true },
  zipCode: { type: String, trim: true },
  country: { type: String, trim: true, default: 'India' },
}, { _id: false });

// --- Main Customer Schema ---
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
  avatar: {
    type: String, 
    trim: true,
  },
  contactPerson: {
    type: String,
    trim: true,
  },
  
  // Optional: Unique if present
  email: {
    type: String,
    trim: true,
    lowercase: true,
    default: null
  },
  
  // Required: Unique per Org
  phone: {
    type: String,
    trim: true,
    required: [true, 'Customer phone number is required'],
  },
  
  // Optional: Unique if present
  altPhone: {
    type: String,
    trim: true,
    default: null
  },
  
  // Optional: Unique if present
  gstNumber: {
    type: String,
    trim: true,
    uppercase: true,
    default: null
  },
  
  // Optional: Unique if present
  panNumber: {
    type: String,
    trim: true,
    uppercase: true,
    default: null
  },

  billingAddress: addressSchema,
  shippingAddress: addressSchema,

  openingBalance: {
    type: Number,
    default: 0,
  },
  outstandingBalance: {
    type: Number,
    default: 0,
  },
  creditLimit: {
    type: Number,
    default: 0,
  },
  paymentTerms: {
    type: String,
    trim: true,
  },

  isActive: {
    type: Boolean,
    default: true,
  },
  isDeleted: {
    type: Boolean,
    default: false,
  },
  tags: [{
    type: String,
    trim: true,
  }],
  notes: {
    type: String,
    trim: true,
  },

  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },

}, { timestamps: true });

// ======================================================
// 🔑 INDEXES (The Fix)
// ======================================================

// 1. PHONE: Strictly Unique per Organization (Since it's required)
customerSchema.index({ organizationId: 1, phone: 1 }, { unique: true });
// 2. SEARCH: Optimize name search
customerSchema.index({ organizationId: 1, name: 1 });
customerSchema.index({ organizationId: 1, outstandingBalance: -1 });
// GST Number
customerSchema.index(
  { organizationId: 1, gstNumber: 1 }, 
  { unique: true, partialFilterExpression: { gstNumber: { $type: "string" } } 
  }
);

// PAN Number
customerSchema.index(
  { organizationId: 1, panNumber: 1 }, 
  { 
    unique: true, 
    partialFilterExpression: { panNumber: { $type: "string" } } 
  }
);

// Email
customerSchema.index(
  { organizationId: 1, email: 1 }, 
  { 
    unique: true, 
    partialFilterExpression: { email: { $type: "string" } } 
  }
);

// Alt Phone
customerSchema.index(
  { organizationId: 1, altPhone: 1 }, 
  { 
    unique: true, 
    partialFilterExpression: { altPhone: { $type: "string" } } 
  }
);

// --- Virtual: Display Name ---
customerSchema.virtual('displayName').get(function () {
  return this.type === 'business' && this.contactPerson
    ? `${this.name} (${this.contactPerson})`
    : this.name;
});

// ======================================================
// 🧹 MIDDLEWARE: Data Sanitization
// ======================================================

customerSchema.pre('save', function (next) {
  // Helper to convert empty strings to null
  const sanitize = (field) => {
    if (this[field] !== undefined && typeof this[field] === 'string') {
      const trimmed = this[field].trim();
      this[field] = trimmed.length > 0 ? trimmed : null;
    }
  };

  // 1. Sanitize Optional Unique Fields
  // If we don't do this, saving "" (empty string) will trigger duplicate errors
  sanitize('gstNumber');
  sanitize('panNumber');
  sanitize('email');
  sanitize('altPhone');

  // 2. Standard Trimming for Names
  if (this.isModified('name') && this.name) this.name = this.name.trim();
  if (this.isModified('contactPerson') && this.contactPerson) this.contactPerson = this.contactPerson.trim();

  next();
});

const Customer = mongoose.model('Customer', customerSchema);
module.exports = Customer;

// const mongoose = require('mongoose');

// // --- Subdocument for Address ---
// const addressSchema = new mongoose.Schema({
//   street: { type: String, trim: true },
//   city: { type: String, trim: true },
//   state: { type: String, trim: true },
//   zipCode: { type: String, trim: true },
//   country: { type: String, trim: true, default: 'India' },
// }, { _id: false });

// // --- Main Customer Schema ---
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
//   avatar: {
//     type: String, 
//     trim: true,
//   },
//   contactPerson: {
//     type: String,
//     trim: true,
//   },
//   email: {
//     type: String,
//     trim: true,
//     lowercase: true,
//   },
//   phone: {
//     type: String,
//     trim: true,
//     required: [true, 'Customer phone number is required'],
//   },
//   altPhone: {
//     type: String,
//     trim: true,
//   },
//   gstNumber: {
//     type: String,
//     trim: true,
//     uppercase: true,
//   },
//   panNumber: {
//     type: String,
//     trim: true,
//     uppercase: true,
//   },

 
//   billingAddress: addressSchema,
//   shippingAddress: addressSchema,

 
//   openingBalance: {
//     type: Number,
//     default: 0,
//   },
//   outstandingBalance: {
//     type: Number,
//     default: 0,
//   },
//   creditLimit: {
//     type:Number,
//     default: 0,
//   },
//   paymentTerms: {
//     type: String,
//     trim: true,
//   },

 
//   isActive: {
//     type: Boolean,
//     default: true,
//   },
//   isDeleted: {
//     type: Boolean,
//     default: false,
//   },
//   tags: [{
//     type: String,
//     trim: true,
//   }],
//   notes: {
//     type: String,
//     trim: true,
//   },

 
//   createdBy: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: 'User',
//   },
//   updatedBy: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: 'User',
//   },

// }, { timestamps: true });

// // --- Indexes ---
// customerSchema.index({ organizationId: 1, phone: 1 }, { unique: true });

// // --- THIS IS THE FIX ---
// // The 'sparse: true' option ensures the index only applies to documents
// // that have a non-null value for 'gstNumber'.
// customerSchema.index({ organizationId: 1, gstNumber: 1 }, { unique: true, sparse: true });

// customerSchema.index({ organizationId: 1, name: 1 });

// // --- Virtual: Display Name ---
// customerSchema.virtual('displayName').get(function () {
//   return this.type === 'business' && this.contactPerson
//     ? `${this.name} (${this.contactPerson})`
//     : this.name;
// });

// // This pre-save hook is correct and works with the sparse index
// customerSchema.pre('save', function (next) {
 
//   if (this.isModified('gstNumber') && this.gstNumber === '') {
//     this.gstNumber = null;
//   }
  
 
//   if (this.isModified('panNumber') && this.panNumber === '') {
//     this.panNumber = null;
//   }
  
//   next();
// });

// // --- Middleware: Normalize ---
// customerSchema.pre('save', function (next) {
//   if (this.isModified('name') && this.name) this.name = this.name.trim();
//   if (this.isModified('contactPerson') && this.contactPerson) this.contactPerson = this.contactPerson.trim();
//   next();
// });

// const Customer = mongoose.model('Customer', customerSchema);
// module.exports = Customer;
