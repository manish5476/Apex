const mongoose = require('mongoose');

const purchaseReturnSchema = new mongoose.Schema({
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true, // FIX #1 — Added index (was missing, causing full scans on org-scoped queries)
  },
  branchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Branch',
    required: true,
    index: true, // FIX #2 — Added index for branch-scoped filtering
  },

  purchaseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Purchase',
    required: true,
    index: true, // FIX #3 — Added index: common query is "all returns for a purchase"
  },
  supplierId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Supplier',
    required: true,
    index: true, // FIX #4 — Added index for supplier-scoped return history
  },

  returnDate:      { type: Date, default: Date.now },
  debitNoteNumber: { type: String, trim: true }, // Optional manual ref

  items: [{
    productId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    name:        String,
    quantity:    { type: Number, min: 1 }, // FIX #5 — Added min validation
    returnPrice: { type: Number, min: 0 }, // FIX #6 — Added min validation
    total:       Number,
  }],

  totalAmount: { type: Number, required: true, min: 0 },
  reason:      { type: String, required: true }, // FIX #7 — Made reason required (was optional, but a return without reason is an audit gap)

  // FIX #8 — Added status field for return approval workflow.
  // Original had no status, meaning returns were always implicitly "approved" on creation.
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
  },

  createdBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  approvedAt: { type: Date, default: null },

}, { timestamps: true });

// ─────────────────────────────────────────────
//  Indexes
// ─────────────────────────────────────────────
// FIX #9 — Added compound index for supplier AP reconciliation
purchaseReturnSchema.index({ organizationId: 1, supplierId: 1, returnDate: -1 });
// FIX #10 — Added status index for approval dashboard
purchaseReturnSchema.index({ organizationId: 1, status: 1, createdAt: -1 });

// ─────────────────────────────────────────────
//  Pre-Save Middleware: Auto-Calculate totalAmount
// ─────────────────────────────────────────────
// FIX #11 — Added auto-calculation of totalAmount from items.
// Original required the controller to pass totalAmount manually — error-prone.
purchaseReturnSchema.pre('save', function (next) {
  if (this.isModified('items') && this.items && this.items.length > 0) {
    let total = 0;
    this.items.forEach(item => {
      // Calculate item total if not explicitly set
      if (!item.total && item.returnPrice && item.quantity) {
        item.total = parseFloat((item.returnPrice * item.quantity).toFixed(2));
      }
      total += item.total || 0;
    });

    // Only override totalAmount on new documents to preserve manual overrides
    if (this.isNew) {
      this.totalAmount = parseFloat(total.toFixed(2));
    }
  }
  next();
});

module.exports = mongoose.model('PurchaseReturn', purchaseReturnSchema);

// const mongoose = require('mongoose');

// const purchaseReturnSchema = new mongoose.Schema({
//     organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
//     branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
    
//     purchaseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Purchase', required: true },
//     supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true },
    
//     returnDate: { type: Date, default: Date.now },
//     debitNoteNumber: { type: String, trim: true }, // Optional manual ref
    
//     items: [{
//         productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
//         name: String,
//         quantity: Number,
//         returnPrice: Number, // Price at which it is returned
//         total: Number
//     }],
    
//     totalAmount: { type: Number, required: true },
//     reason: String,
    
//     createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
// }, { timestamps: true });

// module.exports = mongoose.model('PurchaseReturn', purchaseReturnSchema);