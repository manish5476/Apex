const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({

  // --- Core Links ---
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true,
  },
  branchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Branch',
    index: true,
  },

  // --- Transaction Type ---
  type: {
    type: String,
    enum: ['inflow', 'outflow'],
    required: true,
  },

  // --- References ---
  customerId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  supplierId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier' },
  invoiceId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice' },
  purchaseId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Purchase' },

  // --- Payment Details ---
  paymentDate: { type: Date, default: Date.now },
  referenceNumber: { type: String, trim: true, uppercase: true },

  amount: {
    type: Number,
    required: [true, 'Payment amount is required'],
    min: [0.01, 'Payment amount must be greater than zero'], // FIX #1 — min: 0 allows zero-value payments which are meaningless
  },

  paymentMethod: {
    type: String,
    enum: ['cash', 'bank', 'credit', 'upi', 'cheque', 'other'],
    default: 'cash',
  },

  transactionMode: {
    type: String,
    enum: ['manual', 'auto'],
    default: 'manual',
  },

  transactionId: { type: String, trim: true },
  bankName:      { type: String, trim: true },
  remarks:       { type: String, trim: true },

  // --- Status ---
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'cancelled'],
    default: 'completed',
  },

  // --- Meta ---
  isDeleted: { type: Boolean, default: false },

  // --- Audit Trail ---
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  // --- Payment Allocation ---
  allocationStatus: {
    type: String,
    enum: ['unallocated', 'partially_allocated', 'fully_allocated'],
    default: 'unallocated',
  },

  allocatedTo: [{
    type: {
      type: String,
      enum: ['invoice', 'emi', 'advance', 'purchase', 'other'],
    },
    documentId:         mongoose.Schema.Types.ObjectId,
    emiId:              mongoose.Schema.Types.ObjectId,
    installmentNumber:  Number,
    amount:             Number,
    allocatedAt:        Date,
  }],

  // FIX #2 — CRITICAL: `remainingAmount` default used `function() { return this.amount; }`
  // Mongoose schema-level `default` functions do NOT reliably access sibling fields via `this`.
  // Removed the default here entirely and set it correctly in pre('save') middleware below.
  remainingAmount: {
    type: Number,
    min: 0,
  },

}, { timestamps: true });

// ─────────────────────────────────────────────
//  Indexes
// ─────────────────────────────────────────────
paymentSchema.index({ organizationId: 1, type: 1 });
paymentSchema.index({ organizationId: 1, paymentDate: -1 });
paymentSchema.index({ customerId: 1 });
paymentSchema.index({ supplierId: 1 });
paymentSchema.index({ invoiceId: 1 });
paymentSchema.index({ purchaseId: 1 });
// FIX #3 — Added composite index for payment status filtering (e.g. pending payments dashboard)
paymentSchema.index({ organizationId: 1, status: 1, paymentDate: -1 });
// FIX #4 — Added index for allocation queries
paymentSchema.index({ organizationId: 1, allocationStatus: 1 });

// ─────────────────────────────────────────────
//  Virtuals
// ─────────────────────────────────────────────
paymentSchema.virtual('direction').get(function () {
  return this.type === 'inflow' ? 'Received from Customer' : 'Paid to Supplier';
});

// ─────────────────────────────────────────────
//  Pre-Save Middleware
// ─────────────────────────────────────────────
paymentSchema.pre('save', function (next) {
  // Normalize reference number
  if (this.referenceNumber) {
    this.referenceNumber = this.referenceNumber.trim().toUpperCase();
  }

  // FIX #5 — Set remainingAmount on new documents using `this.amount` (safe in middleware).
  // Also re-sync remainingAmount when amount changes, so it never drifts on creation.
  if (this.isNew) {
    this.remainingAmount = this.amount;
  }

  // FIX #6 — Guard: remainingAmount should never exceed amount or go below 0
  if (this.remainingAmount === undefined || this.remainingAmount === null) {
    this.remainingAmount = this.amount;
  }
  this.remainingAmount = Math.min(
    Math.max(parseFloat(this.remainingAmount.toFixed(2)), 0),
    this.amount
  );

  // FIX #7 — Auto-derive allocationStatus from remainingAmount so controllers
  // don't need to manually manage this field and risk inconsistency.
  if (this.remainingAmount <= 0) {
    this.allocationStatus = 'fully_allocated';
  } else if (this.remainingAmount < this.amount) {
    this.allocationStatus = 'partially_allocated';
  } else {
    this.allocationStatus = 'unallocated';
  }

  next();
});

const Payment = mongoose.model('Payment', paymentSchema);
module.exports = Payment;

// const mongoose = require('mongoose');

// const paymentSchema = new mongoose.Schema({
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

//     // --- Transaction Type ---
//     type: {
//         type: String,
//         enum: ['inflow', 'outflow'], // inflow = received from customer, outflow = paid to supplier
//         required: true,
//     },

//     // --- References (depending on type) ---
//     customerId: {
//         type: mongoose.Schema.Types.ObjectId,
//         ref: 'Customer',
//     },
//     supplierId: {
//         type: mongoose.Schema.Types.ObjectId,
//         ref: 'Supplier',
//     },
//     invoiceId: {
//         type: mongoose.Schema.Types.ObjectId,
//         ref: 'Invoice',
//     },
//     purchaseId: {
//         type: mongoose.Schema.Types.ObjectId,
//         ref: 'Purchase',
//     },

//     // --- Payment Details ---
//     paymentDate: {
//         type: Date,
//         default: Date.now,
//     },
//     referenceNumber: {
//         type: String,
//         trim: true,
//         uppercase: true,
//     },
//     amount: {
//         type: Number,
//         required: [true, 'Payment amount is required'],
//         min: 0,
//     },
//     paymentMethod: {
//         type: String,
//         enum: ['cash', 'bank', 'credit', 'upi', 'cheque', 'other'],
//         default: 'cash',
//     },
//     transactionMode: {
//         type: String,
//         enum: ['manual', 'auto'], // auto = generated via invoice/purchase sync
//         default: 'manual',
//     },
//     transactionId: {
//         type: String,
//         trim: true,
//     },
//     bankName: {
//         type: String,
//         trim: true,
//     },
//     remarks: {
//         type: String,
//         trim: true,
//     },

//     // --- Status ---
//     status: {
//         type: String,
//         enum: ['pending', 'completed', 'failed', 'cancelled'],
//         default: 'completed',
//     },

//     // --- Meta ---
//     isDeleted: {
//         type: Boolean,
//         default: false,
//     },

//     // --- Audit Trail ---
//     createdBy: {
//         type: mongoose.Schema.Types.ObjectId,
//         ref: 'User',
//     },
//     updatedBy: {
//         type: mongoose.Schema.Types.ObjectId,
//         ref: 'User',
//     },
//     // --- Payment Allocation ---
//     allocationStatus: {
//         type: String,
//         enum: ['unallocated', 'partially_allocated', 'fully_allocated'],
//         default: 'unallocated'
//     },

//     allocatedTo: [{
//         type: {
//             type: String,
//             enum: ['invoice', 'emi', 'advance', 'purchase', 'other']
//         },
//         documentId: mongoose.Schema.Types.ObjectId,
//         emiId: mongoose.Schema.Types.ObjectId,
//         installmentNumber: Number,
//         amount: Number,
//         allocatedAt: Date
//     }],

//     remainingAmount: {
//         type: Number,
//         default: function () { return this.amount; }
//     }

// }, { timestamps: true });

// // --- Indexing ---
// paymentSchema.index({ organizationId: 1, type: 1 });
// paymentSchema.index({ customerId: 1 });
// paymentSchema.index({ supplierId: 1 });
// paymentSchema.index({ invoiceId: 1 });
// paymentSchema.index({ purchaseId: 1 });
// paymentSchema.index({ organizationId: 1, paymentDate: -1 });

// // --- Virtual: Transaction Direction ---
// paymentSchema.virtual('direction').get(function () {
//     return this.type === 'inflow' ? 'Received from Customer' : 'Paid to Supplier';
// });

// // --- Middleware: Normalize ---
// paymentSchema.pre('save', function (next) {
//     if (this.referenceNumber) this.referenceNumber = this.referenceNumber.trim().toUpperCase();
//     next();
// });

// const Payment = mongoose.model('Payment', paymentSchema);
// module.exports = Payment;
