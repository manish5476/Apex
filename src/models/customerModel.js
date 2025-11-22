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
  // --- Core Link ---
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true,
  },
  // --- branchId removed ---

  // --- Customer Details ---
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
  avatar: { // <-- ADDED
    type: String, 
    trim: true,
  },
  contactPerson: {
    type: String,
    trim: true,
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
  },
  phone: {
    type: String,
    trim: true,
    required: [true, 'Customer phone number is required'],
  },
  altPhone: {
    type: String,
    trim: true,
  },
  gstNumber: {
    type: String,
    trim: true,
    uppercase: true,
  },
  panNumber: {
    type: String,
    trim: true,
    uppercase: true,
  },

  // --- Address ---
  billingAddress: addressSchema,
  shippingAddress: addressSchema,

  // --- Financial Info ---
  openingBalance: {
    type: Number,
    default: 0,
  },
  outstandingBalance: {
    type: Number,
    default: 0,
  },
  creditLimit: {
    type:Number,
    default: 0,
  },
  paymentTerms: {
    type: String,
    trim: true,
  },

  // --- Status & Meta ---
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

  // --- Audit Trail ---
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },

}, { timestamps: true });

// --- Indexes ---
customerSchema.index({ organizationId: 1, phone: 1 }, { unique: true });

// --- THIS IS THE FIX ---
// The 'sparse: true' option ensures the index only applies to documents
// that have a non-null value for 'gstNumber'.
customerSchema.index({ organizationId: 1, gstNumber: 1 }, { unique: true, sparse: true }); // GST is unique or null

customerSchema.index({ organizationId: 1, name: 1 });

// --- Virtual: Display Name ---
customerSchema.virtual('displayName').get(function () {
  return this.type === 'business' && this.contactPerson
    ? `${this.name} (${this.contactPerson})`
    : this.name;
});

// This pre-save hook is correct and works with the sparse index
customerSchema.pre('save', function (next) {
  // If gstNumber is an empty string, set it to null
  if (this.isModified('gstNumber') && this.gstNumber === '') {
    this.gstNumber = null;
  }
  
  // You can do the same for panNumber if it has a similar index
  if (this.isModified('panNumber') && this.panNumber === '') {
    this.panNumber = null;
  }
  
  next();
});

// --- Middleware: Normalize ---
customerSchema.pre('save', function (next) {
  if (this.isModified('name') && this.name) this.name = this.name.trim();
  if (this.isModified('contactPerson') && this.contactPerson) this.contactPerson = this.contactPerson.trim();
  next();
});

const Customer = mongoose.model('Customer', customerSchema);
module.exports = Customer;
