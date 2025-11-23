const mongoose = require('mongoose');

const { Schema } = mongoose;

const ledgerSchema = new Schema(
  {
    // --- Core Links ---
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    branchId: {
      type: Schema.Types.ObjectId,
      ref: 'Branch',
      index: true,
    },

    // --- Entity References ---
    customerId: {
      type: Schema.Types.ObjectId,
      ref: 'Customer',
    },
    supplierId: {
      type: Schema.Types.ObjectId,
      ref: 'Supplier',
    },

    // --- Source Document Links ---
    invoiceId: {
      type: Schema.Types.ObjectId,
      ref: 'Invoice',
    },
    purchaseId: {
      type: Schema.Types.ObjectId,
      ref: 'Purchase',
    },
    paymentId: {
      type: Schema.Types.ObjectId,
      ref: 'Payment',
    },

    // --- Transaction Info ---
    entryDate: {
      type: Date,
      default: Date.now,
    },
    referenceNumber: {
      type: String,
      trim: true,
      uppercase: true,
    },
    type: {
      type: String,
      enum: ['credit', 'debit'],
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    description: {
      type: String,
      trim: true,
    },
    accountType: {
      type: String,
      enum: ['customer', 'supplier', 'expense', 'income', 'tax', 'other'],
      default: 'customer',
    },

    // --- Status ---
    isReversed: {
      type: Boolean,
      default: false,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },

    // --- Audit Trail ---
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    approvedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

// --- Indexes ---
ledgerSchema.index({ organizationId: 1, entryDate: -1 });
ledgerSchema.index({ organizationId: 1, customerId: 1 });
ledgerSchema.index({ organizationId: 1, supplierId: 1 });
ledgerSchema.index({ organizationId: 1, branchId: 1 });
ledgerSchema.index({ organizationId: 1, type: 1 });

// --- Virtual: Transaction Label ---
ledgerSchema.virtual('entryLabel').get(function () {
  return this.type === 'credit' ? 'Cr' : 'Dr';
});

// --- Normalize reference number ---
ledgerSchema.pre('save', function (next) {
  if (typeof this.referenceNumber === 'string') {
    this.referenceNumber = this.referenceNumber.trim().toUpperCase();
  }
  next();
});

// --- Safe model export ---
const Ledger = mongoose.modelNames().includes('Ledger')
  ? mongoose.model('Ledger')
  : mongoose.model('Ledger', ledgerSchema);

module.exports = Ledger;


// const mongoose = require('mongoose');

// const ledgerSchema = new mongoose.Schema({
//     // --- Core Links ---
//     organizationId: {
//         type: mongoose.Schema.Types.ObjectId,
//         ref: 'Organization',
//         required: true,
//         index: true,
//     },
//     branchId: {
//         type: mongoose.Schema.Types.ObjectId,
//         ref: 'Branch',
//         index: true,
//     },

//     // --- Entity References ---
//     customerId: {
//         type: mongoose.Schema.Types.ObjectId,
//         ref: 'Customer',
//     },
//     supplierId: {
//         type: mongoose.Schema.Types.ObjectId,
//         ref: 'Supplier',
//     },

//     // --- Source Document Links ---
//     invoiceId: {
//         type: mongoose.Schema.Types.ObjectId,
//         ref: 'Invoice',
//     },
//     purchaseId: {
//         type: mongoose.Schema.Types.ObjectId,
//         ref: 'Purchase',
//     },
//     paymentId: {
//         type: mongoose.Schema.Types.ObjectId,
//         ref: 'Payment',
//     },

//     // --- Transaction Info ---
//     entryDate: {
//         type: Date,
//         default: Date.now,
//     },
//     referenceNumber: {
//         type: String,
//         trim: true,
//         uppercase: true,
//     },
//     type: {
//         type: String,
//         enum: ['credit', 'debit'],
//         required: true,
//     },
//     amount: {
//         type: Number,
//         required: true,
//         min: 0,
//     },
//     description: {
//         type: String,
//         trim: true,
//     },
//     accountType: {
//         type: String,
//         enum: ['customer', 'supplier', 'expense', 'income', 'tax', 'other'],
//         default: 'customer',
//     },

//     // --- Status ---
//     isReversed: {
//         type: Boolean,
//         default: false,
//     },
//     isDeleted: {
//         type: Boolean,
//         default: false,
//     },

//     // --- Audit Trail ---
//     createdBy: {
//         type: mongoose.Schema.Types.ObjectId,
//         ref: 'User',
//     },
//     approvedBy: {
//         type: mongoose.Schema.Types.ObjectId,
//         ref: 'User',
//     },

// }, { timestamps: true });

// // --- Indexes for performance ---
// ledgerSchema.index({ organizationId: 1, entryDate: -1 });
// ledgerSchema.index({ organizationId: 1, customerId: 1 });
// ledgerSchema.index({ organizationId: 1, supplierId: 1 });
// ledgerSchema.index({ organizationId: 1, type: 1 });
// ledgerSchema.index({ organizationId: 1, branchId: 1 });

// // --- Virtual: Transaction Label ---
// ledgerSchema.virtual('entryLabel').get(function () {
//     return this.type === 'credit' ? 'Cr' : 'Dr';
// });

// // --- Middleware: Normalize ---
// ledgerSchema.pre('save', function (next) {
//     if (this.referenceNumber) this.referenceNumber = this.referenceNumber.trim().toUpperCase();
//     next();
// });

// const Ledger = mongoose.models.Ledger || mongoose.model('Ledger', ledgerSchema);
// module.exports = Ledger;
