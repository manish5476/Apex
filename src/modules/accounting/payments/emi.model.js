const mongoose = require('mongoose');

// ─────────────────────────────────────────────
//  Sub-Schema: Installment
// ─────────────────────────────────────────────
const installmentSchema = new mongoose.Schema({
  installmentNumber: { type: Number, required: true },
  dueDate:           { type: Date,   required: true },

  // Financials
  principalAmount: { type: Number, required: true },
  interestAmount:  { type: Number, default: 0 },
  totalAmount:     { type: Number, required: true },

  // Status
  paidAmount: { type: Number, default: 0 },
  paymentStatus: {
    type: String,
    enum: ['pending', 'partial', 'paid', 'overdue'],
    default: 'pending',
  },

  // Link to the actual financial transaction
  paymentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Payment',
    default: null,
  },

  // FIX #1 — Added paidAt timestamp so we know WHEN each installment was paid.
  // Critical for overdue detection, reconciliation, and audit trails.
  paidAt: { type: Date, default: null },
});

// ─────────────────────────────────────────────
//  Main EMI Schema
// ─────────────────────────────────────────────
const emiSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    branchId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Branch',       required: true },

    // Linking
    // FIX #2 — CRITICAL: Removed the schema-level `unique: true` on invoiceId.
    // A schema-level unique index blocks re-creation of an EMI for the same invoice
    // if the original was cancelled/deleted, with no workaround.
    // Replaced with a partial index below that only enforces uniqueness for active EMIs.
    invoiceId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice',  required: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },

    // Plan Details
    totalAmount:    { type: Number, required: true },  // Grand Total (incl Interest)
    downPayment:    { type: Number, default: 0 },
    balanceAmount:  { type: Number, required: true },  // Amount to be paid via installments

    numberOfInstallments: { type: Number, required: true },
    interestRate:         { type: Number, default: 0 }, // Annual %

    emiStartDate: { type: Date, required: true },
    emiEndDate:   { type: Date },

    installments: [installmentSchema],

    status: {
      type: String,
      enum: ['active', 'completed', 'defaulted', 'cancelled'], // FIX #3 — Added 'cancelled' to match real-world lifecycle
      default: 'active',
    },

    externalPayments: [{
      transactionId: String,
      gateway:       String,
      amount:        Number,
      paymentDate:   Date,
      reconciledAt:  Date,
      status: {
        type: String,
        enum: ['pending', 'reconciled', 'failed'],
        default: 'pending',
      },
    }],

    advanceBalance: { type: Number, default: 0 },
    lastReconciledAt: Date,

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

// ─────────────────────────────────────────────
//  Indexes
// ─────────────────────────────────────────────

// FIX #4 — Partial unique index: enforce one active EMI per invoice,
// but allow re-creation after cancellation/completion.
emiSchema.index(
  { invoiceId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $in: ['active'] } },
    name: 'unique_active_emi_per_invoice',
  }
);

emiSchema.index({ organizationId: 1, invoiceId: 1 });
emiSchema.index({ organizationId: 1, customerId: 1 });
emiSchema.index({ organizationId: 1, status: 1 });

// FIX #5 — Added compound index for overdue installment detection job.
// A background cron needs to find all pending installments past dueDate efficiently.
emiSchema.index(
  { organizationId: 1, 'installments.dueDate': 1, 'installments.paymentStatus': 1 },
  { name: 'idx_overdue_installments' }
);

// ─────────────────────────────────────────────
//  Pre-Save Middleware
// ─────────────────────────────────────────────
emiSchema.pre('save', function (next) {
  // FIX #6 — Auto-derive EMI status from installments so controllers
  // don't have to manually manage the top-level status field.
  // Only run this logic if installments were modified.
  if (this.isModified('installments') && this.installments && this.installments.length > 0) {
    const allPaid     = this.installments.every(i => i.paymentStatus === 'paid');
    const anyDefaulted = this.installments.some(
      i => i.paymentStatus === 'overdue' && new Date(i.dueDate) < new Date()
    );

    if (allPaid && this.status !== 'cancelled') {
      this.status = 'completed';
    } else if (anyDefaulted && this.status === 'active') {
      this.status = 'defaulted';
    }
  }

  next();
});

// ─────────────────────────────────────────────
//  Validation
// ─────────────────────────────────────────────

// FIX #7 — Guard: numberOfInstallments must match actual installments array length on create
emiSchema.pre('validate', function (next) {
  if (
    this.isNew &&
    this.installments &&
    this.installments.length > 0 &&
    this.installments.length !== this.numberOfInstallments
  ) {
    return next(
      new Error(
        `numberOfInstallments (${this.numberOfInstallments}) does not match installments array length (${this.installments.length})`
      )
    );
  }
  next();
});

const EMI = mongoose.model('EMI', emiSchema);
module.exports = EMI;


// const mongoose = require('mongoose');

// const installmentSchema = new mongoose.Schema({
//   installmentNumber: { type: Number, required: true },
//   dueDate: { type: Date, required: true },

//   // Financials
//   principalAmount: { type: Number, required: true },
//   interestAmount: { type: Number, default: 0 },
//   totalAmount: { type: Number, required: true },

//   // Status
//   paidAmount: { type: Number, default: 0 },
//   paymentStatus: {
//     type: String,
//     enum: ['pending', 'partial', 'paid', 'overdue'],
//     default: 'pending',
//   },

//   // Link to the actual financial transaction
//   paymentId: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: 'Payment',
//     default: null
//   }
// });

// const emiSchema = new mongoose.Schema(
//   {
//     organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
//     branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },

//     // Linking
//     invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice', required: true, unique: true },
//     customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },

//     // Plan Details
//     totalAmount: { type: Number, required: true }, // Grand Total (incl Interest)
//     downPayment: { type: Number, default: 0 },
//     balanceAmount: { type: Number, required: true }, // Amount to be paid via installments

//     numberOfInstallments: { type: Number, required: true },
//     interestRate: { type: Number, default: 0 }, // Annual %

//     emiStartDate: { type: Date, required: true },
//     emiEndDate: { type: Date },

//     installments: [installmentSchema],

//     status: {
//       type: String,
//       enum: ['active', 'completed', 'defaulted'],
//       default: 'active',
//     },
//     externalPayments: [{
//       transactionId: String,
//       gateway: String,
//       amount: Number,
//       paymentDate: Date,
//       reconciledAt: Date,
//       status: {
//         type: String,
//         enum: ['pending', 'reconciled', 'failed'],
//         default: 'pending'
//       }
//     }],

//     advanceBalance: {
//       type: Number,
//       default: 0
//     },

//     lastReconciledAt: Date
//     ,
//     createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
//   },
//   { timestamps: true }
// );

// // Indexes for fast lookup
// emiSchema.index({ organizationId: 1, invoiceId: 1 });
// emiSchema.index({ organizationId: 1, customerId: 1 });
// emiSchema.index({ organizationId: 1, status: 1 });

// const EMI = mongoose.model('EMI', emiSchema);
// module.exports = EMI;
