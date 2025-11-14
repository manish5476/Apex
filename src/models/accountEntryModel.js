// src/models/accountEntryModel.js
const mongoose = require('mongoose');

/**
 * AccountEntryModel
 * -----------------
 * Represents a single journal line (debit or credit) that affects one account.
 * Every financial transaction (invoice, payment, purchase, adjustment, etc.)
 * creates one or more AccountEntry documents.
 */

const accountEntrySchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true
    },

    accountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Account',
      required: true,
      index: true
    },

    // Transaction origin: for traceability back to source docs
    referenceType: {
      type: String,
      enum: ['invoice', 'purchase', 'payment', 'ledger', 'manual', null],
      default: null,
      index: true
    },

    referenceId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      index: true
    },

    // Posting date (accounting date)
    date: {
      type: Date,
      required: true,
      default: Date.now,
      index: true
    },

    // Amounts: exactly one side should be > 0
    debit: {
      type: Number,
      required: true,
      default: 0,
      min: 0
    },

    credit: {
      type: Number,
      required: true,
      default: 0,
      min: 0
    },

    // Optional description or narration
    description: {
      type: String,
      trim: true
    },

    // Optional user who created the posting
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },

    // For grouping or auditing
    batchId: {
      type: String,
      default: null,
      index: true
    }
  },
  { timestamps: true }
);

// ---------- Derived fields and integrity checks ----------

// Prevent both debit and credit being zero simultaneously
accountEntrySchema.pre('save', function (next) {
  if (this.debit === 0 && this.credit === 0) {
    return next(new Error('AccountEntry must have either debit or credit amount'));
  }
  if (this.debit > 0 && this.credit > 0) {
    return next(new Error('AccountEntry cannot have both debit and credit > 0'));
  }
  next();
});

// ---------- Indexes for performance ----------
accountEntrySchema.index({ organizationId: 1, date: -1 });
accountEntrySchema.index({ accountId: 1, date: -1 });
accountEntrySchema.index({ referenceType: 1, referenceId: 1 });

// ---------- Static helper ----------
/**
 * Compute balance (debit - credit) for a given account
 */
accountEntrySchema.statics.computeBalance = async function (organizationId, accountId) {
  const result = await this.aggregate([
    { $match: { organizationId, accountId } },
    {
      $group: {
        _id: '$accountId',
        totalDebit: { $sum: '$debit' },
        totalCredit: { $sum: '$credit' }
      }
    },
    {
      $project: {
        _id: 0,
        accountId: '$_id',
        balance: { $subtract: ['$totalDebit', '$totalCredit'] }
      }
    }
  ]);
  return result.length ? result[0].balance : 0;
};

// ---------- Virtuals ----------
accountEntrySchema.virtual('amount').get(function () {
  return this.debit || this.credit;
});

module.exports = mongoose.model('AccountEntry', accountEntrySchema);
