const mongoose = require('mongoose');

// ─────────────────────────────────────────────
//  Sub-Schema: Return Item
// ─────────────────────────────────────────────
const returnItemSchema = new mongoose.Schema({
  productId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  name:           { type: String, required: true },
  quantity:       { type: Number, required: true, min: 1 },
  unitPrice:      { type: Number, required: true, min: 0 },
  taxAmount:      { type: Number, default: 0, min: 0 },
  discountAmount: { type: Number, default: 0, min: 0 },
  refundAmount:   { type: Number, required: true, min: 0 },
}, { _id: false });

// ─────────────────────────────────────────────
//  Main SalesReturn Schema
// ─────────────────────────────────────────────
const salesReturnSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  branchId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Branch',       required: true, index: true },
  invoiceId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice',      required: true, index: true },
  customerId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Customer',     required: true, index: true },

  returnNumber: { type: String, required: true, unique: true },
  returnDate:   { type: Date, default: Date.now },

  items: [returnItemSchema],

  subTotal:         { type: Number, default: 0 },
  taxTotal:         { type: Number, default: 0 },

  // FIX #1 — Added discountTotal to match item-level discountAmount accumulation.
  // Original schema had no discountTotal but items have discountAmount — inconsistent.
  discountTotal: { type: Number, default: 0 },

  totalRefundAmount: { type: Number, required: true, min: 0 },

  reason: { type: String, required: true },

  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    // FIX #2 — Changed default from 'approved' to 'pending'.
    // Auto-approving returns without review is a financial risk in production.
    // Returns should go through an approval workflow before affecting inventory/ledger.
    default: 'pending',
  },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  // FIX #3 — Added approvedBy/rejectedBy audit fields for the approval workflow
  approvedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  approvedAt:  { type: Date, default: null },
  rejectedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  rejectedAt:  { type: Date, default: null },
  rejectionReason: { type: String, default: null },

}, { timestamps: true });

// ─────────────────────────────────────────────
//  Indexes
// ─────────────────────────────────────────────
// FIX #4 — Added status index for returns approval dashboard
salesReturnSchema.index({ organizationId: 1, status: 1, createdAt: -1 });

// ─────────────────────────────────────────────
//  Pre-Save Middleware: Auto-Calculate Totals
// ─────────────────────────────────────────────
// FIX #5 — CRITICAL: Original schema had NO pre-save middleware to compute totals.
// subTotal, taxTotal, discountTotal, and totalRefundAmount had to be manually
// computed and passed from the controller — a common source of bugs and inconsistency.
// Fix: Auto-calculate from items, same pattern as Invoice and Purchase.
salesReturnSchema.pre('save', function (next) {
  if (this.isModified('items') && this.items && this.items.length > 0) {
    let subTotal      = 0;
    let taxTotal      = 0;
    let discountTotal = 0;
    let totalRefund   = 0;

    this.items.forEach(item => {
      const lineGross = item.unitPrice * item.quantity;
      subTotal      += lineGross;
      taxTotal      += item.taxAmount      || 0;
      discountTotal += item.discountAmount || 0;
      totalRefund   += item.refundAmount;
    });

    this.subTotal         = parseFloat(subTotal.toFixed(2));
    this.taxTotal         = parseFloat(taxTotal.toFixed(2));
    this.discountTotal    = parseFloat(discountTotal.toFixed(2));

    // FIX #6 — Only override totalRefundAmount from items if it hasn't been
    // explicitly set (e.g., partial refunds set by controller override item sum)
    // This preserves intentional partial refund scenarios.
    if (this.isNew) {
      this.totalRefundAmount = parseFloat(totalRefund.toFixed(2));
    }
  }
  next();
});

module.exports = mongoose.model('SalesReturn', salesReturnSchema);
// // src/models/salesReturnModel.js
// const mongoose = require('mongoose');

// const returnItemSchema = new mongoose.Schema({
//     productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
//     name: { type: String, required: true },
//     quantity: { type: Number, required: true, min: 1 },
//     unitPrice: { type: Number, required: true },
//     taxAmount: { type: Number, default: 0 },
//     discountAmount: { type: Number, default: 0 },
//     refundAmount: { type: Number, required: true } // Total for this line (qty * price + tax - discount)
// }, { _id: false });

// const salesReturnSchema = new mongoose.Schema({
//     organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
//     branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    
//     // Link to original sale
//     invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice', required: true, index: true },
//     customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
    
//     returnNumber: { type: String, required: true, unique: true }, // e.g., RET-0001
//     returnDate: { type: Date, default: Date.now },
    
//     items: [returnItemSchema],
    
//     // Financials
//     subTotal: { type: Number, default: 0 },
//     taxTotal: { type: Number, default: 0 },
//     totalRefundAmount: { type: Number, required: true },
    
//     reason: { type: String, required: true },
//     status: { type: String, enum: ['approved', 'rejected'], default: 'approved' },
    
//     createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
// }, { timestamps: true });

// module.exports = mongoose.model('SalesReturn', salesReturnSchema);
