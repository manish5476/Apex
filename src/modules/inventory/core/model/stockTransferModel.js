const mongoose = require('mongoose');

const stockTransferSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  productId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Product',      required: true },
  fromBranchId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Branch',       required: true },
  toBranchId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Branch',       required: true },
  quantity:       { type: Number, required: true, min: 1 },
  reason:         { type: String, trim: true },

  status: {
    type: String,
    enum: ['pending', 'completed', 'cancelled'],
    default: 'completed',
  },

  transferDate: { type: Date, default: Date.now },
  createdBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  // FIX #1 — Added approvedBy for transfer approval workflow.
  // In a multi-branch setup, stock transfers should be approved by a manager
  // before inventory counts are updated, to prevent unauthorized stock movements.
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  approvedAt: { type: Date, default: null },

  // FIX #2 — Added notes field for transfer documentation
  notes: { type: String, trim: true, default: null },

}, { timestamps: true });

// ─────────────────────────────────────────────
//  Indexes
// ─────────────────────────────────────────────
stockTransferSchema.index({ organizationId: 1, transferDate: -1 });
stockTransferSchema.index({ organizationId: 1, productId: 1 });
stockTransferSchema.index({ organizationId: 1, fromBranchId: 1 });
stockTransferSchema.index({ organizationId: 1, toBranchId: 1 });
// FIX #3 — Added status index for pending transfer approval dashboard
stockTransferSchema.index({ organizationId: 1, status: 1, transferDate: -1 });

// ─────────────────────────────────────────────
//  Validation
// ─────────────────────────────────────────────

// FIX #4 — CRITICAL: Added validation to prevent self-transfer.
// A transfer from a branch to itself is logically invalid and will silently
// double-count inventory if processed. This must be caught before save.
stockTransferSchema.pre('validate', function (next) {
  if (
    this.fromBranchId &&
    this.toBranchId &&
    this.fromBranchId.toString() === this.toBranchId.toString()
  ) {
    return next(
      new Error('Source branch (fromBranchId) and destination branch (toBranchId) cannot be the same')
    );
  }
  next();
});

const StockTransfer = mongoose.model('StockTransfer', stockTransferSchema);
module.exports = StockTransfer;

