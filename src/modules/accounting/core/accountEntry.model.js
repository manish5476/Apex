const mongoose = require('mongoose');

const accountEntrySchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', index: true },

    // Ledger account link
    accountId: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true, index: true },

    // Sub-ledger links
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null, index: true },
    supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', default: null, index: true },

    // Transaction links
    invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice', index: true, default: null },
    purchaseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Purchase', index: true, default: null },
    paymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment', index: true, default: null },

    // Ledger core fields
    date: { type: Date, required: true, default: Date.now, index: true },

    debit: { type: Number, required: true, default: 0, min: 0 },
    credit: { type: Number, required: true, default: 0, min: 0 },

    description: { type: String, trim: true },
    referenceNumber: { type: String, trim: true, uppercase: true }, // important

    referenceType: { type: String, enum: ['invoice', 'opening_stock', 'emi_payment', 'emi_down_payment', 'purchase','purchase_return' ,  'payment', 'journal', 'manual', null], default: null },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);


/* ============================================================
   HIGH PERFORMANCE INDEXES (CRITICAL FOR LARGE DATASETS)
=============================================================== */

// core index for pagination + sorting
accountEntrySchema.index(
  { organizationId: 1, date: -1, _id: -1 },
  { background: true }
);

// account filters
accountEntrySchema.index(
  { organizationId: 1, date: -1, accountId: 1 },
  { background: true }
);

// customer filters
accountEntrySchema.index(
  { organizationId: 1, date: -1, customerId: 1 },
  { background: true }
);

// supplier filters
accountEntrySchema.index(
  { organizationId: 1, date: -1, supplierId: 1 },
  { background: true }
);

// reference search
accountEntrySchema.index(
  { referenceNumber: 1 },
  { background: true }
);

// full text search on narration
accountEntrySchema.index(
  { description: 'text' },
  { background: true }
);


/* ============================================================
   DATA INTEGRITY CHECKS
=============================================================== */
accountEntrySchema.pre('save', function (next) {
  if (this.debit === 0 && this.credit === 0)
    return next(new Error('Entry must have value'));

  if (this.debit > 0 && this.credit > 0)
    return next(new Error('Entry cannot be both debit and credit'));

  // rounding protection
  if (this.debit) this.debit = Math.round(this.debit * 100) / 100;
  if (this.credit) this.credit = Math.round(this.credit * 100) / 100;

  next();
});

module.exports = mongoose.model('AccountEntry', accountEntrySchema);
