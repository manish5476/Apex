const mongoose = require('mongoose');

const accountEntrySchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', index: true }, // ✅ Added for Multi-branch

    // General Ledger Link (Financial Reports)
    accountId: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true, index: true },

    // Sub-Ledger Links (The Fix for "Split-Brain")
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', index: true, default: null },
    supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', index: true, default: null },

    // Transaction Links
    invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice', default: null },
    purchaseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Purchase', default: null },
    paymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment', default: null },

    date: { type: Date, required: true, default: Date.now, index: true },
    
    debit: { type: Number, required: true, default: 0, min: 0 },
    credit: { type: Number, required: true, default: 0, min: 0 },
    
    description: { type: String, trim: true },
    referenceNumber: { type: String, trim: true, uppercase: true }, // ✅ Searchable Ref
    referenceType: { type: String, enum: ['invoice', 'purchase', 'payment', 'journal', 'manual', null], default: null },
    
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
  },
  { timestamps: true }
);

// Integrity Checks
accountEntrySchema.pre('save', function (next) {
  if (this.debit === 0 && this.credit === 0) return next(new Error('Entry must have value'));
  if (this.debit > 0 && this.credit > 0) return next(new Error('Entry cannot be both debit and credit'));
  
  // Rounding Safety
  if (this.debit) this.debit = Math.round(this.debit * 100) / 100;
  if (this.credit) this.credit = Math.round(this.credit * 100) / 100;
  
  next();
});

module.exports = mongoose.model('AccountEntry', accountEntrySchema);

// // src/models/accountEntryModel.js
// const mongoose = require('mongoose');
// const accountEntrySchema = new mongoose.Schema(
//   {
//     organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
//     accountId: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true, index: true },
//     referenceType: { type: String, enum: ['invoice', 'purchase', 'payment', 'ledger', 'manual', null], default: null, index: true },
//     referenceId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
//     date: { type: Date, required: true, default: Date.now, index: true },
//     debit: { type: Number, required: true, default: 0, min: 0 },
//     credit: { type: Number, required: true, default: 0, min: 0 }, description: { type: String, trim: true },
//     createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
//     batchId: { type: String, default: null, index: true }
//   },
//   { timestamps: true }
// );

// // ---------- Derived fields and integrity checks ----------

// // Prevent both debit and credit being zero simultaneously
// accountEntrySchema.pre('save', function (next) {
//   if (this.debit === 0 && this.credit === 0) {
//     return next(new Error('AccountEntry must have either debit or credit amount'));
//   }
//   if (this.debit > 0 && this.credit > 0) {
//     return next(new Error('AccountEntry cannot have both debit and credit > 0'));
//   }
//   next();
// });

// // ---------- Indexes for performance ----------
// accountEntrySchema.index({ organizationId: 1, date: -1 });
// accountEntrySchema.index({ accountId: 1, date: -1 });
// accountEntrySchema.index({ referenceType: 1, referenceId: 1 });

// // ---------- Static helper ----------
// /**
//  * Compute balance (debit - credit) for a given account
//  */
// accountEntrySchema.statics.computeBalance = async function (organizationId, accountId) {
//   const result = await this.aggregate([
//     { $match: { organizationId, accountId } },
//     { $group: { _id: '$accountId', totalDebit: { $sum: '$debit' }, totalCredit: { $sum: '$credit' } } },
//     { $project: { _id: 0, accountId: '$_id', balance: { $subtract: ['$totalDebit', '$totalCredit'] } } }
//   ]);
//   return result.length ? result[0].balance : 0;
// };

// // ---------- Virtuals ----------
// accountEntrySchema.virtual('amount').get(function () {
//   return this.debit || this.credit;
// });

// module.exports = mongoose.model('AccountEntry', accountEntrySchema);
