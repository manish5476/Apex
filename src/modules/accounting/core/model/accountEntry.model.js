const mongoose = require('mongoose');

const accountEntrySchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    branchId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Branch',       index: true },

    // Ledger account link
    accountId: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true, index: true },

    // Sub-ledger links
    customerId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null, index: true },
    supplierId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', default: null, index: true },

    // Transaction links
    invoiceId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice',  index: true, default: null },
    purchaseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Purchase', index: true, default: null },
    paymentId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Payment',  index: true, default: null },

    date: { type: Date, required: true, default: Date.now, index: true },

    debit:  { type: Number, required: true, default: 0, min: 0 },
    credit: { type: Number, required: true, default: 0, min: 0 },

    description:     { type: String, trim: true },
    referenceNumber: { type: String, trim: true, uppercase: true },

    referenceType: {
      type: String,
      enum: [
        'invoice', 'opening_stock', 'emi_payment', 'emi_down_payment',
        'purchase', 'purchase_return', 'sales_return', 'credit_note',
        'payment', 'journal', 'manual', null,
      ],
      default: null,
    },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

/* ============================================================
   HIGH PERFORMANCE INDEXES (CRITICAL FOR LARGE DATASETS)
   Each index is annotated with its primary query use-case.
============================================================= */

// Core: General ledger pagination + sorting (most used)
accountEntrySchema.index({ organizationId: 1, date: -1, _id: -1 },{ background: true, name: 'idx_org_date_id' });
// Account ledger: filter by specific chart-of-account
accountEntrySchema.index({ organizationId: 1, date: -1, accountId: 1 },{ background: true, name: 'idx_org_date_account' });
// Customer sub-ledger: AR aging, customer statement
accountEntrySchema.index({ organizationId: 1, date: -1, customerId: 1 },{ background: true, name: 'idx_org_date_customer' });
// Supplier sub-ledger: AP aging, supplier statement
accountEntrySchema.index({ organizationId: 1, date: -1, supplierId: 1 },{ background: true, name: 'idx_org_date_supplier' });
// Reference search: look up entries by voucher/reference number
accountEntrySchema.index({ referenceNumber: 1 },{ background: true, name: 'idx_reference_number' });
// Full text search on narration/description
accountEntrySchema.index({ description: 'text' },{ background: true, name: 'idx_description_text' });
// FIX #1 — Added invoiceId index for reconciliation queries.
// Without this, finding all ledger entries for a specific invoice requires a full collection scan.
accountEntrySchema.index({ organizationId: 1, invoiceId: 1 },{ background: true, sparse: true, name: 'idx_org_invoice' });
// FIX #2 — Added referenceType + date index for type-based filtering.
// Common query: "show all payment entries this month" or "all journal entries for audit"
accountEntrySchema.index({ organizationId: 1, referenceType: 1, date: -1 },{ background: true, name: 'idx_org_reftype_date' });
// FIX #3 — Added purchaseId index to match invoiceId index (was missing, inconsistent)
accountEntrySchema.index({ organizationId: 1, purchaseId: 1 },{ background: true, sparse: true, name: 'idx_org_purchase' });
/* ============================================================
   DATA INTEGRITY CHECKS
============================================================= */
accountEntrySchema.pre('save', function (next) {
  // FIX #4 — Improved validation messages to include actual values for easier debugging
  if (this.debit === 0 && this.credit === 0) {
    return next(new Error('AccountEntry must have a non-zero debit or credit value'));
  }

  if (this.debit > 0 && this.credit > 0) {
    return next(
      new Error(`AccountEntry cannot be both debit (${this.debit}) and credit (${this.credit}) simultaneously`)
    );
  }

  // Rounding protection — normalize to 2 decimal places
  if (this.debit)  this.debit  = Math.round(this.debit  * 100) / 100;
  if (this.credit) this.credit = Math.round(this.credit * 100) / 100;

  next();
});

module.exports = mongoose.model('AccountEntry', accountEntrySchema);

// const mongoose = require('mongoose');

// const accountEntrySchema = new mongoose.Schema(
//   {
//     organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
//     branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', index: true },

//     // Ledger account link
//     accountId: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true, index: true },

//     // Sub-ledger links
//     customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null, index: true },
//     supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', default: null, index: true },

//     // Transaction links
//     invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice', index: true, default: null },
//     purchaseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Purchase', index: true, default: null },
//     paymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment', index: true, default: null },

//     // Ledger core fields
//     date: { type: Date, required: true, default: Date.now, index: true },

//     debit: { type: Number, required: true, default: 0, min: 0 },
//     credit: { type: Number, required: true, default: 0, min: 0 },

//     description: { type: String, trim: true },
//     referenceNumber: { type: String, trim: true, uppercase: true }, // important

//     referenceType: { type: String, enum: ['invoice', 'opening_stock', 'emi_payment', 'emi_down_payment', 'purchase','purchase_return' ,  'payment', 'journal', 'manual', null], default: null },

//     createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
//   },
//   { timestamps: true }
// );


// /* ============================================================
//    HIGH PERFORMANCE INDEXES (CRITICAL FOR LARGE DATASETS)
// =============================================================== */

// // core index for pagination + sorting
// accountEntrySchema.index(
//   { organizationId: 1, date: -1, _id: -1 },
//   { background: true }
// );

// // account filters
// accountEntrySchema.index(
//   { organizationId: 1, date: -1, accountId: 1 },
//   { background: true }
// );

// // customer filters
// accountEntrySchema.index(
//   { organizationId: 1, date: -1, customerId: 1 },
//   { background: true }
// );

// // supplier filters
// accountEntrySchema.index(
//   { organizationId: 1, date: -1, supplierId: 1 },
//   { background: true }
// );

// // reference search
// accountEntrySchema.index(
//   { referenceNumber: 1 },
//   { background: true }
// );

// // full text search on narration
// accountEntrySchema.index(
//   { description: 'text' },
//   { background: true }
// );


// /* ============================================================
//    DATA INTEGRITY CHECKS
// =============================================================== */
// accountEntrySchema.pre('save', function (next) {
//   if (this.debit === 0 && this.credit === 0)
//     return next(new Error('Entry must have value'));

//   if (this.debit > 0 && this.credit > 0)
//     return next(new Error('Entry cannot be both debit and credit'));

//   // rounding protection
//   if (this.debit) this.debit = Math.round(this.debit * 100) / 100;
//   if (this.credit) this.credit = Math.round(this.credit * 100) / 100;

//   next();
// });

// module.exports = mongoose.model('AccountEntry', accountEntrySchema);
