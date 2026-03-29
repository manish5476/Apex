const mongoose = require('mongoose');

const pendingReconciliationSchema = new mongoose.Schema({
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true,
  },
  invoiceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Invoice',
    required: true,
    index: true,
  },
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
    index: true,
  },

  // Payment details from external system
  externalTransactionId: { type: String, trim: true },
  externalReference:     { type: String, trim: true },
  amount:                { type: Number, min: 0 },
  paymentDate:           { type: Date },
  paymentMethod:         { type: String, trim: true },
  gateway:               { type: String, trim: true },
  rawData:               Object, // Store original payment data for audit

  // Reconciliation status
  status: {
    type: String,
    enum: ['pending', 'matched', 'unmatched', 'failed'],
    default: 'pending',
    index: true,
  },

  matchedEmiId:        { type: mongoose.Schema.Types.ObjectId, ref: 'EMI' },
  matchedInstallments: [Number],

  // Manual reconciliation fields
  notes:        String,
  reconciledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reconciledAt: Date,

  // FIX #1 — CRITICAL: Removed manually defined `createdAt` and `updatedAt` fields.
  // The original schema had:
  //   createdAt: { type: Date, default: Date.now }
  //   updatedAt: Date
  // AND `{ timestamps: true }` — which creates both fields automatically.
  // This dual-definition causes a conflict: Mongoose's timestamps manager tries to
  // update `updatedAt` on every save, but the manual field definition interferes,
  // leading to unpredictable behavior (updatedAt not updating on findOneAndUpdate, etc).
  // Fix: Remove manual definitions entirely. `timestamps: true` handles both correctly.
}, {
  timestamps: true, // ✅ This correctly creates and manages both createdAt and updatedAt
});

// ─────────────────────────────────────────────
//  Indexes
// ─────────────────────────────────────────────

// FIX #2 — Added compound index for the most common query:
// "show all pending reconciliations for this org, newest first"
pendingReconciliationSchema.index({ organizationId: 1, status: 1, createdAt: -1 });

// FIX #3 — Added index for external transaction deduplication
// Prevents duplicate reconciliation entries for the same external payment
pendingReconciliationSchema.index(
  { organizationId: 1, externalTransactionId: 1 },
  {
    sparse: true, // externalTransactionId can be null for manual entries
    name: 'idx_org_ext_txn_dedup',
  }
);

const PendingReconciliation = mongoose.model('PendingReconciliation', pendingReconciliationSchema);
module.exports = PendingReconciliation;


// // models/pendingReconciliationModel.js
// const mongoose = require('mongoose');

// const pendingReconciliationSchema = new mongoose.Schema({
//   organizationId: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: 'Organization',
//     required: true
//   },
//   invoiceId: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: 'Invoice',
//     required: true
//   },
//   customerId: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: 'Customer'
//   },
  
//   // Payment details from external system
//   externalTransactionId: String,
//   externalReference: String,
//   amount: Number,
//   paymentDate: Date,
//   paymentMethod: String,
//   gateway: String,
//   rawData: Object, // Store original payment data
  
//   // Reconciliation status
//   status: {
//     type: String,
//     enum: ['pending', 'matched', 'unmatched', 'failed'],
//     default: 'pending'
//   },
//   matchedEmiId: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: 'EMI'
//   },
//   matchedInstallments: [Number], // Installment numbers matched
  
//   // Manual reconciliation fields
//   notes: String,
//   reconciledBy: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: 'User'
//   },
//   reconciledAt: Date,
  
//   // Metadata
//   createdAt: {
//     type: Date,
//     default: Date.now
//   },
//   updatedAt: Date
// }, { timestamps: true });

// const PendingReconciliation = mongoose.model('PendingReconciliation', pendingReconciliationSchema);
// module.exports = PendingReconciliation;