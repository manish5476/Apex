'use strict';

const mongoose = require('mongoose');

// ─────────────────────────────────────────────
//  Sub-Schema: Return Item
// ─────────────────────────────────────────────
const returnItemSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  name: { type: String, required: true },
  quantity: { type: Number, required: true, min: 1 },
  unitPrice: { type: Number, required: true, min: 0 },
  taxAmount: { type: Number, default: 0, min: 0 },
  discountAmount: { type: Number, default: 0, min: 0 },
  refundAmount: { type: Number, required: true, min: 0 },
}, { _id: false });

// ─────────────────────────────────────────────
//  Main SalesReturn Schema
// ─────────────────────────────────────────────
const salesReturnSchema = new mongoose.Schema({

  // ── Tenant & Context ──────────────────────────────────────────
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true,
  },
  branchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Branch',
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
    required: true,
    index: true,
  },

  // ── Identity ──────────────────────────────────────────────────
  returnNumber: { type: String, required: true, unique: true },
  returnDate: { type: Date, default: Date.now },

  // ── Items ─────────────────────────────────────────────────────
  items: [returnItemSchema],

  // ── Financials (auto-calculated in pre-save) ──────────────────
  subTotal: { type: Number, default: 0 },
  taxTotal: { type: Number, default: 0 },
  discountTotal: { type: Number, default: 0 },
  totalRefundAmount: { type: Number, required: true, min: 0 },

  // ── Reason ────────────────────────────────────────────────────
  reason: { type: String, required: true, trim: true },
  notes: { type: String, trim: true, default: null },

  // ── Approval Workflow ─────────────────────────────────────────
  // FIX: Default changed from 'approved' to 'pending'.
  // Stock and ledger effects only happen on explicit approval.
  // Auto-approving returns is a financial risk — anyone could
  // create a return and immediately corrupt inventory/AR.
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
    index: true,
  },

  // ── Audit ─────────────────────────────────────────────────────
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  approvedAt: { type: Date, default: null },
  approvalReason: { type: String, trim: true, default: null },

  rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  rejectedAt: { type: Date, default: null },
  rejectionReason: { type: String, default: null },

}, { timestamps: true });

// ─────────────────────────────────────────────
//  Indexes
// ─────────────────────────────────────────────

// Approval dashboard: "show me all pending returns for this org"
salesReturnSchema.index({ organizationId: 1, status: 1, createdAt: -1 });

// Customer return history
salesReturnSchema.index({ organizationId: 1, customerId: 1, createdAt: -1 });

// Invoice-level return lookup (check what's already been returned)
salesReturnSchema.index({ organizationId: 1, invoiceId: 1 });

// ─────────────────────────────────────────────
//  Virtuals
// ─────────────────────────────────────────────

// Net refund excluding tax — useful for revenue reversal reporting
salesReturnSchema.virtual('netRefund').get(function () {
  return parseFloat((this.totalRefundAmount - this.taxTotal).toFixed(2));
});

// ─────────────────────────────────────────────
//  Pre-Save Middleware: Auto-Calculate Totals
// ─────────────────────────────────────────────
salesReturnSchema.pre('save', function (next) {
  // Only recalculate when items are actually modified
  if (!this.isModified('items') || !this.items?.length) return next();

  let subTotal = 0;
  let taxTotal = 0;
  let discountTotal = 0;
  let totalRefund = 0;

  for (const item of this.items) {
    const lineGross = item.unitPrice * item.quantity;
    subTotal += lineGross;
    taxTotal += item.taxAmount || 0;
    discountTotal += item.discountAmount || 0;
    totalRefund += item.refundAmount;
  }

  this.subTotal = parseFloat(subTotal.toFixed(2));
  this.taxTotal = parseFloat(taxTotal.toFixed(2));
  this.discountTotal = parseFloat(discountTotal.toFixed(2));

  // FIX: Only auto-set totalRefundAmount on new documents.
  // On updates, the service may set a partial refund (e.g. store credit
  // instead of full cash refund) which should not be overridden here.
  if (this.isNew) {
    this.totalRefundAmount = parseFloat(totalRefund.toFixed(2));
  }

  // Guard: totalRefundAmount should never be negative
  if (this.totalRefundAmount < 0) {
    return next(new Error('totalRefundAmount cannot be negative'));
  }

  next();
});

// ─────────────────────────────────────────────
//  Pre-Save: Approval state consistency
// ─────────────────────────────────────────────
salesReturnSchema.pre('save', function (next) {
  // Enforce: approvedBy/approvedAt only valid when status is 'approved'
  if (this.status !== 'approved') {
    this.approvedBy = null;
    this.approvedAt = null;
    this.approvalReason = null;
  }
  // Enforce: rejectedBy/rejectedAt only valid when status is 'rejected'
  if (this.status !== 'rejected') {
    this.rejectedBy = null;
    this.rejectedAt = null;
    this.rejectionReason = null;
  }
  next();
});

module.exports = mongoose.model('SalesReturn', salesReturnSchema);
