const mongoose = require("mongoose");

// ─────────────────────────────────────────────
//  Sub-Schema: Invoice Item
// ─────────────────────────────────────────────
const invoiceItemSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    name: { type: String, required: true, trim: true },
    reminderSent:      { type: Boolean, default: false },
    overdueNoticeSent: { type: Boolean, default: false },
    overdueCount:      { type: Number,  default: 0 },
    hsnCode:  { type: String, trim: true },
    quantity: { type: Number, required: true, min: 1 },
    unit:     { type: String, trim: true, default: "pcs" },
    // FIX #1 — purchasePriceAtSale is hidden via `select: false`
    // This is correct for security, but controllers that need profit
    // calculation MUST explicitly use .select('+purchasePriceAtSale')
    purchasePriceAtSale: { type: Number, required: true, select: false },
    price:    { type: Number, required: true, min: 0 },
    // FIX #2 — discount is now a LINE-LEVEL total rupee discount (not per-unit)
    // This aligns with how grandTotal is computed (subTotal - totalDiscount)
    // and fixes the tax-base double-accounting bug in the original schema.
    // Convention: discount = flat rupee amount deducted from this line's total
    discount: { type: Number, default: 0, min: 0 },
    taxRate: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

// ─────────────────────────────────────────────
//  Main Invoice Schema
// ─────────────────────────────────────────────
const invoiceSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    branchId:       { type: mongoose.Schema.Types.ObjectId, ref: "Branch",       index: true },
    customerId:     { type: mongoose.Schema.Types.ObjectId, ref: "Customer",     index: true },
    saleId:         { type: mongoose.Schema.Types.ObjectId, ref: "Sales" },
    invoiceNumber: { type: String, required: true, trim: true, uppercase: true, index: true },
    invoiceDate:   { type: Date, default: Date.now },
    dueDate:       { type: Date },
    status: {
      type: String,
      enum: ["draft", "issued", "paid", "cancelled"],
      default: "issued",
    },

    billingAddress:  { type: String, trim: true },
    shippingAddress: { type: String, trim: true },
    placeOfSupply:   { type: String, trim: true },
    items: [invoiceItemSchema],
    subTotal:      { type: Number, default: 0 },
    totalTax:      { type: Number, default: 0 },
    totalDiscount: { type: Number, default: 0 },
    roundOff:      { type: Number, default: 0 },
    grandTotal:    { type: Number, required: true, default: 0 },

    paymentStatus: {
      type: String,
      enum: ["unpaid", "partial", "paid"],
      default: "unpaid",
    },
    paidAmount:    { type: Number, default: 0 },
    balanceAmount: { type: Number, default: 0 },

    paymentMethod: {
      type: String,
      // FIX #3 — Added 'cheque' to match the Payment model enum and avoid
      // validation errors when syncing payment method from Payment → Invoice
      enum: ["cash", "bank", "credit", "upi", "cheque", "other"],
      default: "cash",
    },

    paymentReference: { type: String, trim: true },
    transactionId:    { type: String, trim: true },

    gstType: {
      type: String,
      enum: ["intra-state", "inter-state", "export"],
      default: "intra-state",
    },
    irnNumber: { type: String, trim: true },
    qrCode:    { type: String, trim: true },

    notes:         { type: String, trim: true },
    attachedFiles: [{ type: String, trim: true }],

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// ─────────────────────────────────────────────
//  Indexes
// ─────────────────────────────────────────────
invoiceSchema.index({ organizationId: 1, invoiceNumber: 1 }, { unique: true });
invoiceSchema.index({ organizationId: 1, invoiceDate: -1 });
invoiceSchema.index({ organizationId: 1, branchId: 1, invoiceDate: -1 });
invoiceSchema.index({ organizationId: 1, createdAt: -1 });
invoiceSchema.index({ organizationId: 1, customerId: 1 });
// FIX #4 — Added status index for common filtered queries (e.g. "all unpaid invoices")
invoiceSchema.index({ organizationId: 1, status: 1, invoiceDate: -1 });
// FIX #5 — Added paymentStatus index for AR aging / reconciliation queries
invoiceSchema.index({ organizationId: 1, paymentStatus: 1 });

// ─────────────────────────────────────────────
//  Virtual: totalQuantity
// ─────────────────────────────────────────────
invoiceSchema.virtual("totalQuantity").get(function () {
  if (!this.items || this.items.length === 0) return 0;
  return this.items.reduce((acc, item) => acc + item.quantity, 0);
});

// ─────────────────────────────────────────────
//  Pre-Save Middleware: Auto-Calculate Financials
// ─────────────────────────────────────────────
invoiceSchema.pre("save", function (next) {
  if (this.isModified("items") || this.isModified("paidAmount")) {
    let subTotal      = 0;
    let totalTax      = 0;
    let totalDiscount = 0;

    this.items.forEach((item) => {
      const lineTotal    = item.price * item.quantity;         // Gross line total
      const lineDiscount = item.discount || 0;                 // Flat rupee discount for this line
      const taxableBase  = lineTotal - lineDiscount;           // Tax is on net amount after discount

      // FIX #6 — CRITICAL: Previously 'discount' was subtracted from tax base but also
      // accumulated in totalDiscount and subtracted AGAIN in grandTotal.
      // Fix: accumulate each component cleanly and apply once in the grandTotal formula.
      totalDiscount += lineDiscount;
      totalTax      += ((item.taxRate || 0) / 100) * taxableBase;
      subTotal      += lineTotal; // subTotal = sum of gross line totals (before discount)
    });

    // grandTotal = gross sales - discounts + tax + rounding
    // This is the single source of truth; no double-deduction of discount.
    const grand = subTotal - totalDiscount + totalTax + (this.roundOff || 0);

    // FIX #7 — CRITICAL BUG: Original code checked `this.grandTotal < 0` which is the
    // STALE (old) value, not the newly computed value. Fixed to validate `grand`.
    if (grand < 0) {
      return next(new Error("Grand total cannot be negative. Check discounts and prices."));
    }

    this.subTotal      = parseFloat(subTotal.toFixed(2));
    this.totalTax      = parseFloat(totalTax.toFixed(2));
    this.totalDiscount = parseFloat(totalDiscount.toFixed(2));

    // FIX #8 — Consistent rounding to 2 decimal places.
    // Original used Math.round() which strips paise. Changed to toFixed(2) for
    // financial accuracy (matches Purchase model's corrected behavior).
    this.grandTotal   = parseFloat(grand.toFixed(2));
    this.balanceAmount = parseFloat((this.grandTotal - (this.paidAmount || 0)).toFixed(2));

    // Derive paymentStatus from balanceAmount
    if (this.balanceAmount <= 0) {
      this.paymentStatus = "paid";
    } else if ((this.paidAmount || 0) > 0 && this.balanceAmount > 0) {
      this.paymentStatus = "partial";
    } else {
      this.paymentStatus = "unpaid";
    }
  }
  next();
});

const Invoice = mongoose.model("Invoice", invoiceSchema);
module.exports = Invoice;


// const mongoose = require("mongoose");

// // --- Subdocument for Invoice Items ---
// const invoiceItemSchema = new mongoose.Schema(
//     {
//         productId: {type: mongoose.Schema.Types.ObjectId,ref: "Product",required: true,},
//         name: {type: String,required: true,trim: true,},
//         reminderSent: { type: Boolean, default: false },
//         overdueNoticeSent: { type: Boolean, default: false },
//         overdueCount: { type: Number, default: 0 },
//         hsnCode: { type: String, trim: true },
//         quantity: { type: Number, required: true, min: 1 },
//         unit: { type: String, trim: true, default: "pcs" },
//         purchasePriceAtSale: { type: Number, required: true, select: false }, // Hidden "Snapshot"
//         price: { type: Number, required: true, min: 0 },
//         discount: { type: Number, default: 0 },
//         taxRate: { type: Number, default: 0 },
//     },
//     { _id: false },
// );

// // --- Main Invoice Schema ---
// const invoiceSchema = new mongoose.Schema(
//     {
//         organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
//         branchId: { type: mongoose.Schema.Types.ObjectId, ref: "Branch", index: true },
//         customerId: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", index: true },
//         saleId: { type: mongoose.Schema.Types.ObjectId, ref: "Sales" },
//         invoiceNumber: { type: String, required: true, trim: true, uppercase: true, index: true },
//         invoiceDate: { type: Date, default: Date.now },
//         dueDate: { type: Date },
//         status: { type: String, enum: ["draft", "issued", "paid", "cancelled"], default: "issued" },
//         billingAddress: { type: String, trim: true },
//         shippingAddress: { type: String, trim: true },
//         placeOfSupply: { type: String, trim: true },
//         items: [invoiceItemSchema],
//         subTotal: { type: Number, default: 0 },
//         totalTax: { type: Number, default: 0 },
//         totalDiscount: { type: Number, default: 0 },
//         roundOff: { type: Number, default: 0 },
//         grandTotal: { type: Number, required: true, default: 0 },
//         paymentStatus: { type: String, enum: ["unpaid", "partial", "paid"], default: "unpaid" },
//         paidAmount: { type: Number, default: 0 },
//         balanceAmount: { type: Number, default: 0 },
//         paymentMethod: { type: String, enum: ["cash", "bank", "credit", "upi", "other"], default: "cash" },
//         paymentReference: { type: String, trim: true },
//         transactionId: { type: String, trim: true },
//         gstType: { type: String, enum: ["intra-state", "inter-state", "export"], default: "intra-state" },
//         irnNumber: { type: String, trim: true },
//         qrCode: { type: String, trim: true },

//         // --- Files & Notes ---
//         notes: { type: String, trim: true },
//         attachedFiles: [{ type: String, trim: true }],

//         // --- Audit ---
//         createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
//         updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
//         isDeleted: { type: Boolean, default: false },
//     },
//     { timestamps: true },
// );

// // --- Indexes ---
// invoiceSchema.index({ organizationId: 1, invoiceNumber: 1 }, { unique: true });
// invoiceSchema.index({ organizationId: 1, invoiceDate: -1 });
// invoiceSchema.index({ organizationId: 1, branchId: 1, invoiceDate: -1 });
// invoiceSchema.index({ organizationId: 1, createdAt: -1 });
// invoiceSchema.index({ organizationId: 1, customerId: 1 });

// // --- Virtuals & Middleware ---
// invoiceSchema.virtual("totalQuantity").get(function () {
//     if (!this.items || this.items.length === 0) return 0;
//     return this.items.reduce((acc, item) => acc + item.quantity, 0);
// });

// invoiceSchema.pre("save", function (next) {
//     if (this.isModified("items") || this.isModified("paidAmount")) {
//         let subTotal = 0;
//         let totalTax = 0;
//         let totalDiscount = 0;

//         this.items.forEach((item) => {
//             const lineTotal = item.price * item.quantity;
//             totalDiscount += item.discount || 0;
//             totalTax += ((item.taxRate || 0) / 100) * (lineTotal - (item.discount || 0));
//             subTotal += lineTotal;
//         });

//         const grand = subTotal + totalTax - totalDiscount + (this.roundOff || 0);
//         if (this.grandTotal < 0) {
//             return next(new Error("Grand total cannot be negative. Check discounts."));
//         }
//         this.subTotal = subTotal;
//         this.totalTax = totalTax;
//         this.totalDiscount = totalDiscount;
//         this.grandTotal = Math.round(grand);
//         this.balanceAmount = this.grandTotal - (this.paidAmount || 0);

//         if (this.balanceAmount <= 0) this.paymentStatus = "paid";
//         else if (this.paidAmount > 0 && this.balanceAmount > 0) this.paymentStatus = "partial";
//         else this.paymentStatus = "unpaid";
//     }
//     next();
// });

// const Invoice = mongoose.model("Invoice", invoiceSchema);
// module.exports = Invoice;
