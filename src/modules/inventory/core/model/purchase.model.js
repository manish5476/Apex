const mongoose = require('mongoose');

// ─────────────────────────────────────────────
//  Sub-Schema: Purchase Item
// ─────────────────────────────────────────────
const purchaseItemSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  name: { type: String, required: true },
  quantity: { type: Number, required: true, min: 1 },
  purchasePrice: { type: Number, required: true, min: 0 },
  taxRate: { type: Number, default: 0, min: 0 },
  // FIX #1 — discount should be min: 0 to prevent negative discounts corrupting totals
  discount: { type: Number, default: 0, min: 0 },
}, { _id: false });

// ─────────────────────────────────────────────
//  Main Purchase Schema
// ─────────────────────────────────────────────
const purchaseSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },

  supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true, index: true },

  // Supplier snapshot: preserves supplier details at time of purchase
  // even if supplier record is later modified or deleted
  supplierSnapshot: {
    name: String,
    address: String,
    gstNumber: String,
    email: String,
  },

  invoiceNumber: { type: String, trim: true, uppercase: true, index: true },
  purchaseDate: { type: Date, default: Date.now },
  dueDate: { type: Date },

  status: {
    type: String,
    enum: ['draft', 'received', 'cancelled'],
    default: 'draft',
  },

  items: [purchaseItemSchema],

  // Financials (auto-calculated in pre-save)
  subTotal: { type: Number, default: 0 },
  totalTax: { type: Number, default: 0 },
  totalDiscount: { type: Number, default: 0 },
  grandTotal: { type: Number, required: true, default: 0 },

  // Payment Tracking
  paymentStatus: {
    type: String,
    enum: ['unpaid', 'partial', 'paid', 'overpaid'],
    default: 'unpaid',
  },
  paidAmount: { type: Number, default: 0 },
  balanceAmount: { type: Number, default: 0 },
  paymentMethod: {
    type: String,
    // FIX #2 — Added 'cheque' to match Invoice and Payment model enums
    enum: ['cash', 'bank', 'credit', 'upi', 'cheque', 'other'],
    default: 'cash',
  },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  notes: { type: String, trim: true },

  attachedFiles: [{
    url: String,
    public_id: String,
    format: String,
    bytes: Number,
    assetId: { type: mongoose.Schema.Types.ObjectId, ref: 'Asset' },
  }],
  // 🟢 ADD THIS: Track returns as separate ledger entries
  returnedQuantities: [{
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    quantity: { type: Number, required: true },
    returnDate: { type: Date, default: Date.now },
    reason: String,
    returnId: String // e.g., a reference to the Return Transaction
  }],
  isDeleted: { type: Boolean, default: false },

}, { timestamps: true });

// ─────────────────────────────────────────────
//  Indexes
// ─────────────────────────────────────────────
purchaseSchema.index({ organizationId: 1, supplierId: 1 });
purchaseSchema.index({ organizationId: 1, invoiceNumber: 1 }, { unique: true, sparse: true });
purchaseSchema.index({ organizationId: 1, purchaseDate: -1 });
// FIX #3 — Added paymentStatus index for AP dashboard queries
purchaseSchema.index({ organizationId: 1, paymentStatus: 1 });
// FIX #4 — Added status index for filtering received vs draft purchases
purchaseSchema.index({ organizationId: 1, status: 1, purchaseDate: -1 });


// ─────────────────────────────────────────────
//  Virtual: itemsWithReturns
//  Calculates net quantities for each line item
// ─────────────────────────────────────────────
purchaseSchema.virtual('itemsWithReturns').get(function () {
  if (!this.items) return [];

  return this.items.map(item => {
    // Sum all returns for this specific product in this purchase
    const totalReturned = this.returnedQuantities
      .filter(r => r.productId.toString() === item.productId.toString())
      .reduce((sum, r) => sum + r.quantity, 0);

    return {
      ...item.toObject(),
      returnedQuantity: totalReturned,
      netQuantity: item.quantity - totalReturned,
      isFullyReturned: (item.quantity - totalReturned) <= 0
    };
  });
});

// Ensure virtuals are included when converting to JSON (for API responses)
purchaseSchema.set('toJSON', { virtuals: true });
purchaseSchema.set('toObject', { virtuals: true });

// ─────────────────────────────────────────────
//  Virtual: totalQuantity
// ─────────────────────────────────────────────
purchaseSchema.virtual('totalQuantity').get(function () {
  if (!this.items || this.items.length === 0) return 0;
  return this.items.reduce((acc, item) => acc + item.quantity, 0);
});

// ─────────────────────────────────────────────
//  Pre-Save Middleware: Auto-Calculate Financials
// ─────────────────────────────────────────────
purchaseSchema.pre('save', function (next) {
  if (this.isModified('items') || this.isModified('paidAmount')) {
    let subTotal = 0;
    let totalTax = 0;
    let totalDiscount = 0;

    if (this.items && this.items.length > 0) {
      this.items.forEach(item => {
        const itemTotal = item.purchasePrice * item.quantity;
        const itemDiscount = item.discount || 0;
        const taxableBase = itemTotal - itemDiscount; // Tax on net amount after discount

        subTotal += itemTotal;
        totalDiscount += itemDiscount;
        totalTax += ((item.taxRate || 0) / 100) * taxableBase;
      });
    }

    this.subTotal = parseFloat(subTotal.toFixed(2));
    this.totalTax = parseFloat(totalTax.toFixed(2));
    this.totalDiscount = parseFloat(totalDiscount.toFixed(2));

    // FIX #5 — Consistent formula: grandTotal = subTotal - totalDiscount + totalTax
    // Original was: subTotal + totalTax - totalDiscount (same mathematically)
    // but now explicitly consistent with Invoice model formula for accounting clarity.
    const grand = subTotal - totalDiscount + totalTax;

    // FIX #6 — Guard: grandTotal cannot be negative
    if (grand < 0) {
      return next(new Error('Grand total cannot be negative. Check purchase prices and discounts.'));
    }

    // FIX #7 — Consistent 2 decimal place rounding across Invoice & Purchase.
    // Original Purchase used toFixed(2) but Invoice used Math.round() (whole number).
    // Both now use toFixed(2) to prevent reconciliation mismatches in AccountEntry.
    this.grandTotal = parseFloat(grand.toFixed(2));
    this.paidAmount = this.paidAmount || 0;
    this.balanceAmount = parseFloat((this.grandTotal - this.paidAmount).toFixed(2));

    // Derive paymentStatus
    if (this.balanceAmount < 0) {
      this.paymentStatus = 'overpaid';
    } else if (this.balanceAmount === 0 && this.paidAmount > 0) {
      this.paymentStatus = 'paid';
    } else if (this.paidAmount > 0 && this.balanceAmount > 0) {
      this.paymentStatus = 'partial';
    } else {
      this.paymentStatus = 'unpaid';
    }
  }
  next();
});

const Purchase = mongoose.model('Purchase', purchaseSchema);
module.exports = Purchase;




// const mongoose = require('mongoose');

// const purchaseItemSchema = new mongoose.Schema({
//     productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
//     name: { type: String, required: true },
//     quantity: { type: Number, required: true, min: 1 },
//     purchasePrice: { type: Number, required: true, min: 0 },
//     taxRate: { type: Number, default: 0 },
//     discount: { type: Number, default: 0 },
// }, { _id: false });

// const purchaseSchema = new mongoose.Schema({
//     organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
//     branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },

//     // --- Supplier Link & Snapshot (CRITICAL FOR AUDIT) ---
//     supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true, index: true },
//     supplierSnapshot: { // <--- Added this so if Supplier is deleted/changed, invoice remains valid
//         name: String,
//         address: String,
//         gstNumber: String,
//         email: String
//     },

//     invoiceNumber: { type: String, trim: true, uppercase: true, index: true },
//     purchaseDate: { type: Date, default: Date.now },
//     dueDate: { type: Date },

//     status: { type: String, enum: ['draft', 'received', 'cancelled'], default: 'draft' },

//     items: [purchaseItemSchema],

//     // --- Financials ---
//     subTotal: { type: Number, default: 0 },
//     totalTax: { type: Number, default: 0 },
//     totalDiscount: { type: Number, default: 0 },
//     grandTotal: { type: Number, required: true, default: 0 },

//     // --- Payment Tracking ---
//     paymentStatus: { type: String, enum: ['unpaid', 'partial', 'paid', 'overpaid'], default: 'unpaid' },
//     paidAmount: { type: Number, default: 0 },
//     balanceAmount: { type: Number, default: 0 },

//     // Note: This field is ambiguous if you have multiple payments (e.g. part cash, part bank).
//     // Ideally rely on the Payment collection for this, but keeping it for "Preferred/Initial Method" is fine.
//     paymentMethod: { type: String, enum: ['cash', 'bank', 'credit', 'upi', 'other'], default: 'cash' },

//     createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
//     approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
//     notes: { type: String, trim: true },
//     // NEW: Allow full object
//     // attachedFiles: [{
//     //     url: { type: String, required: true },
//     //     public_id: { type: String },
//     //     format: { type: String },
//     //     fileName: { type: String }
//     // }],
//     // In Purchase Schema
//     attachedFiles: [{
//         url: String,
//         public_id: String,
//         format: String,
//         bytes: Number,
//         assetId: { type: mongoose.Schema.Types.ObjectId, ref: 'Asset' } // NEW: The master link
//     }],
//     // attachedFiles: [{ type: String, trim: true }],
//     isDeleted: { type: Boolean, default: false },
// }, { timestamps: true });

// // --- Indexes ---
// purchaseSchema.index({ organizationId: 1, supplierId: 1 });
// purchaseSchema.index({ organizationId: 1, invoiceNumber: 1 }, { unique: true, sparse: true });
// purchaseSchema.index({ organizationId: 1, purchaseDate: -1 });

// // --- Virtuals ---
// purchaseSchema.virtual('totalQuantity').get(function () {
//     if (!this.items || this.items.length === 0) return 0;
//     return this.items.reduce((acc, item) => acc + item.quantity, 0);
// });

// // --- Middleware: Auto-Calculate Financials & Status ---
// purchaseSchema.pre('save', function (next) {
//     // Only recalculate if items or paidAmount changed
//     if (this.isModified('items') || this.isModified('paidAmount')) {
//         let subTotal = 0;
//         let totalTax = 0;
//         let totalDiscount = 0;

//         // 1. Calculate Items
//         if (this.items && this.items.length > 0) {
//             this.items.forEach(item => {
//                 const itemTotal = item.purchasePrice * item.quantity;
//                 const itemDiscount = item.discount || 0;

//                 subTotal += itemTotal;
//                 totalDiscount += itemDiscount;

//                 // Tax is usually applied on (Price - Discount)
//                 const taxableAmount = itemTotal - itemDiscount;
//                 totalTax += ((item.taxRate || 0) / 100) * taxableAmount;
//             });
//         }

//         this.subTotal = subTotal;
//         this.totalTax = totalTax;
//         this.totalDiscount = totalDiscount;
//         this.grandTotal = Math.round((subTotal + totalTax - totalDiscount) * 100) / 100; // Round to 2 decimals

//         // 2. Calculate Balance
//         // Ensure paidAmount is not undefined
//         this.paidAmount = this.paidAmount || 0;
//         this.balanceAmount = Math.round((this.grandTotal - this.paidAmount) * 100) / 100;

//         // 3. AUTO-UPDATE STATUS (New Logic)
//         // This removes the need to write if/else logic in your controllers
//         if (this.balanceAmount <= 0 && this.paidAmount > 0) {
//             this.paymentStatus = 'paid';
//             if (this.balanceAmount < 0) this.paymentStatus = 'overpaid'; // Edge case handling
//         } else if (this.paidAmount > 0 && this.balanceAmount > 0) {
//             this.paymentStatus = 'partial';
//         } else {
//             this.paymentStatus = 'unpaid';
//         }
//     }
//     next();
// });

// const Purchase = mongoose.model('Purchase', purchaseSchema);
// module.exports = Purchase;




// // const mongoose = require('mongoose');

// // const purchaseItemSchema = new mongoose.Schema({
// //     productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, },
// //     name: { type: String, required: true, },
// //     quantity: { type: Number, required: true, min: 1, },
// //     purchasePrice: { type: Number, required: true, min: 0, },
// //     taxRate: { type: Number, default: 0, },
// //     discount: { type: Number, default: 0, },
// // }, { _id: false });
// // const purchaseSchema = new mongoose.Schema({
// //     organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true, },
// //     branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true, },
// //     supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true, index: true, },
// //     invoiceNumber: { type: String, trim: true, uppercase: true, index: true, },
// //     purchaseDate: { type: Date, default: Date.now, },
// //     dueDate: { type: Date, },
// //     status: { type: String, enum: ['draft', 'received', 'cancelled'], default: 'draft', },
// //     items: [purchaseItemSchema],
// //     subTotal: { type: Number, default: 0, },
// //     totalTax: { type: Number, default: 0, },
// //     totalDiscount: { type: Number, default: 0, },
// //     grandTotal: { type: Number, required: true, default: 0, },
// //     paymentStatus: { type: String, enum: ['unpaid', 'partial', 'paid'], default: 'unpaid', },
// //     paidAmount: { type: Number, default: 0, },
// //     balanceAmount: { type: Number, default: 0, },
// //     paymentMethod: { type: String, enum: ['cash', 'bank', 'credit', 'upi', 'other'], default: 'cash', },
// //     createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, },
// //     approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', },
// //     notes: { type: String, trim: true, },
// //     attachedFiles: [{ type: String,trim: true, }],
// //     isDeleted: { type: Boolean, default: false, },
// // }, { timestamps: true });

// // purchaseSchema.index({ organizationId: 1, supplierId: 1 });
// // purchaseSchema.index({ organizationId: 1, invoiceNumber: 1 }, { unique: true, sparse: true });
// // purchaseSchema.index({ organizationId: 1, purchaseDate: -1 });
// // purchaseSchema.virtual('totalQuantity').get(function () {
// //     if (!this.items || this.items.length === 0) return 0;
// //     return this.items.reduce((acc, item) => acc + item.quantity, 0);
// // });
// // purchaseSchema.pre('save', function (next) {
// //     if (this.isModified('items') || this.isModified('paidAmount')) { let subTotal = 0; let totalTax = 0; let totalDiscount = 0; this.items.forEach(item => { const itemTotal = item.purchasePrice * item.quantity; subTotal += itemTotal; totalDiscount += item.discount || 0; totalTax += ((item.taxRate || 0) / 100) * (itemTotal - (item.discount || 0)) }); this.subTotal = subTotal; this.totalTax = totalTax; this.totalDiscount = totalDiscount; this.grandTotal = subTotal + totalTax - totalDiscount; this.balanceAmount = this.grandTotal - (this.paidAmount || 0); }
// //     next();
// // });
// // const Purchase = mongoose.model('Purchase', purchaseSchema);
// // module.exports = Purchase;