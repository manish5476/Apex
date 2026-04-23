'use strict';

const mongoose = require("mongoose");

// ─────────────────────────────────────────────
//  Sub-Schema: Invoice Item
// ─────────────────────────────────────────────
const invoiceItemSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    name: { type: String, required: true, trim: true },
    reminderSent: { type: Boolean, default: false },
    overdueNoticeSent: { type: Boolean, default: false },
    overdueCount: { type: Number, default: 0 },
    hsnCode: { type: String, trim: true },
    quantity: { type: Number, required: true, min: 0 },
    originalQuantity: { type: Number, min: 0 },
    unit: { type: String, trim: true, default: "pcs" },
    purchasePriceAtSale: { type: Number, required: true, select: false },
    price: { type: Number, required: true, min: 0 },
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
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: "Branch", index: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", index: true },
    saleId: { type: mongoose.Schema.Types.ObjectId, ref: "Sales" },
    invoiceNumber: { type: String, required: true, trim: true, uppercase: true, index: true },
    invoiceDate: { type: Date, default: Date.now },
    dueDate: { type: Date },
    status: {
      type: String,
      enum: ["draft", "issued", "paid", "partially_paid", "cancelled", "returned", "partially_returned"],
      default: "issued",
    },

    billingAddress: { type: String, trim: true },
    shippingAddress: { type: String, trim: true },
    placeOfSupply: { type: String, trim: true },
    items: [invoiceItemSchema],

    subTotal: { type: Number, default: 0 },
    totalTax: { type: Number, default: 0 },
    totalDiscount: { type: Number, default: 0 },
    shippingCharges: { type: Number, default: 0, min: 0 }, // 🟢 Added
    roundOff: { type: Number, default: 0 },
    grandTotal: { type: Number, required: true, default: 0 },

    paymentStatus: {
      type: String,
      enum: ["unpaid", "partial", "paid"],
      default: "unpaid",
    },
    paidAmount: { type: Number, default: 0 },
    balanceAmount: { type: Number, default: 0 },

    paymentMethod: {
      type: String,
      enum: ["cash", "bank", "credit", "upi", "cheque", "other"],
      default: "cash",
    },

    paymentReference: { type: String, trim: true },
    transactionId: { type: String, trim: true },
    gstType: {
      type: String,
      enum: ["intra-state", "inter-state", "export"],
      default: "intra-state",
    },
    irnNumber: { type: String, trim: true },
    qrCode: { type: String, trim: true },

    notes: { type: String, trim: true },
    attachedFiles: [{ type: String, trim: true }],

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Indexes
invoiceSchema.index({ organizationId: 1, invoiceNumber: 1 }, { unique: true });
invoiceSchema.index({ organizationId: 1, invoiceDate: -1 });
invoiceSchema.index({ organizationId: 1, status: 1, invoiceDate: -1 });
invoiceSchema.index({ organizationId: 1, paymentStatus: 1 });

// Virtuals
invoiceSchema.virtual("totalQuantity").get(function () {
  if (!this.items || this.items.length === 0) return 0;
  return this.items.reduce((acc, item) => acc + item.quantity, 0);
});

// ─────────────────────────────────────────────
//  Unified Pre-Save Middleware
// ─────────────────────────────────────────────
invoiceSchema.pre("save", function (next) {
  // Recalculate if items, payments, or extra charges change
  if (
    this.isModified("items") ||
    this.isModified("paidAmount") ||
    this.isModified("shippingCharges") ||
    this.isModified("roundOff")
  ) {
    let subTotal = 0;
    let totalTax = 0;
    let totalDiscount = 0;

    this.items.forEach((item) => {
      const lineTotal = item.price * item.quantity;
      const lineDiscount = item.discount || 0;
      const taxableBase = lineTotal - lineDiscount;

      totalDiscount += lineDiscount;
      totalTax += ((item.taxRate || 0) / 100) * taxableBase;
      subTotal += lineTotal;
    });

    // Final Formula: Gross - Discounts + Tax + Shipping + Rounding
    const grand =
      subTotal -
      totalDiscount +
      totalTax +
      (this.shippingCharges || 0) +
      (this.roundOff || 0);

    // Guard against negative totals
    if (grand < 0) {
      return next(new Error("Grand total cannot be negative. Check discounts and prices."));
    }

    // Set Final Values rounded to 2 decimal places
    this.subTotal = parseFloat(subTotal.toFixed(2));
    this.totalTax = parseFloat(totalTax.toFixed(2));
    this.totalDiscount = parseFloat(totalDiscount.toFixed(2));
    this.shippingCharges = parseFloat((this.shippingCharges || 0).toFixed(2));
    this.grandTotal = parseFloat(grand.toFixed(2));

    this.balanceAmount = parseFloat((this.grandTotal - (this.paidAmount || 0)).toFixed(2));

    // Derive paymentStatus
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
