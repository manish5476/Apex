const mongoose = require('mongoose');

// --- Subdocument for Address ---
const addressSchema = new mongoose.Schema({
  street: { type: String, trim: true },
  city: { type: String, trim: true },
  state: { type: String, trim: true },
  zipCode: { type: String, trim: true },
  country: { type: String, trim: true, default: 'India' },
});

// --- Main Supplier Schema ---
const supplierSchema = new mongoose.Schema(
  {
    // --- Core Link ---
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },

    avatar: { type: String },

    // --- Business Details ---
    companyName: {
      type: String,
      required: [true, 'Supplier company name is required'],
      trim: true,
    },

    contactPerson: { type: String, trim: true },

    email: {
      type: String,
      trim: true,
      lowercase: true,
      sparse: true, // required for compound unique
    },

    phone: {
      type: String,
      trim: true,
      sparse: true,
    },

    altPhone: { type: String, trim: true },

    gstNumber: {
      type: String,
      trim: true,
      uppercase: true,
      sparse: true,
    },

    panNumber: { type: String, trim: true, uppercase: true },

    // --- Address ---
    address: addressSchema,

    // --- Financial Info ---
    openingBalance: { type: Number, default: 0 },
    outstandingBalance: { type: Number, default: 0 },
    paymentTerms: { type: String, trim: true },

    // --- Relations ---
    branchesSupplied: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Branch',
      },
    ],

    // --- Status ---
    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },

    // --- Audit Trail ---
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

/* ===================================================
   🔥 CRITICAL FIX: Multi-tenant unique indexes
   Prevent duplicate email/phone/gst inside organization
==================================================== */
supplierSchema.index(
  { organizationId: 1, email: 1 },
  { unique: true, sparse: true }
);

supplierSchema.index(
  { organizationId: 1, phone: 1 },
  { unique: true, sparse: true }
);

supplierSchema.index(
  { organizationId: 1, gstNumber: 1 },
  { unique: true, sparse: true }
);

/* Additional Useful Indexes */
supplierSchema.index({ organizationId: 1, companyName: 1 });
// REMOVED DUPLICATE: organizationId + gstNumber was listed here again.

// --- Virtual for Display Name ---
supplierSchema.virtual('displayName').get(function () {
  return this.contactPerson
    ? `${this.companyName} (${this.contactPerson})`
    : this.companyName;
});

// --- Middleware: Normalize Text ---
supplierSchema.pre('save', function (next) {
  if (this.companyName) this.companyName = this.companyName.trim();
  if (this.contactPerson) this.contactPerson = this.contactPerson.trim();
  next();
});

const Supplier = mongoose.model('Supplier', supplierSchema);
module.exports = Supplier;
// const mongoose = require('mongoose');

// // --- Subdocument for Address ---
// const addressSchema = new mongoose.Schema({
//   street: { type: String, trim: true },
//   city: { type: String, trim: true },
//   state: { type: String, trim: true },
//   zipCode: { type: String, trim: true },
//   country: { type: String, trim: true, default: 'India' },
// });

// // --- Main Supplier Schema ---
// const supplierSchema = new mongoose.Schema(
//   {
//     // --- Core Link ---
//     organizationId: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: 'Organization',
//       required: true,
//       index: true,
//     },

//     avatar: { type: String },

//     // --- Business Details ---
//     companyName: {
//       type: String,
//       required: [true, 'Supplier company name is required'],
//       trim: true,
//     },

//     contactPerson: { type: String, trim: true },

//     email: {
//       type: String,
//       trim: true,
//       lowercase: true,
//       sparse: true, // required for compound unique
//     },

//     phone: {
//       type: String,
//       trim: true,
//       sparse: true,
//     },

//     altPhone: { type: String, trim: true },

//     gstNumber: {
//       type: String,
//       trim: true,
//       uppercase: true,
//       sparse: true,
//     },

//     panNumber: { type: String, trim: true, uppercase: true },

//     // --- Address ---
//     address: addressSchema,

//     // --- Financial Info ---
//     openingBalance: { type: Number, default: 0 },
//     outstandingBalance: { type: Number, default: 0 },
//     paymentTerms: { type: String, trim: true },

//     // --- Relations ---
//     branchesSupplied: [
//       {
//         type: mongoose.Schema.Types.ObjectId,
//         ref: 'Branch',
//       },
//     ],

//     // --- Status ---
//     isActive: { type: Boolean, default: true },
//     isDeleted: { type: Boolean, default: false },

//     // --- Audit Trail ---
//     createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
//     updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
//   },
//   { timestamps: true }
// );

// /* ===================================================
//    🔥 CRITICAL FIX: Multi-tenant unique indexes
//    Prevent duplicate email/phone/gst inside organization
// ==================================================== */
// supplierSchema.index(
//   { organizationId: 1, email: 1 },
//   { unique: true, sparse: true }
// );

// supplierSchema.index(
//   { organizationId: 1, phone: 1 },
//   { unique: true, sparse: true }
// );

// supplierSchema.index(
//   { organizationId: 1, gstNumber: 1 },
//   { unique: true, sparse: true }
// );

// /* Additional Useful Indexes */
// supplierSchema.index({ organizationId: 1, companyName: 1 });
// supplierSchema.index({ organizationId: 1, gstNumber: 1 });

// // --- Virtual for Display Name ---
// supplierSchema.virtual('displayName').get(function () {
//   return this.contactPerson
//     ? `${this.companyName} (${this.contactPerson})`
//     : this.companyName;
// });

// // --- Middleware: Normalize Text ---
// supplierSchema.pre('save', function (next) {
//   if (this.companyName) this.companyName = this.companyName.trim();
//   if (this.contactPerson) this.contactPerson = this.contactPerson.trim();
//   next();
// });

// const Supplier = mongoose.model('Supplier', supplierSchema);
// module.exports = Supplier;
