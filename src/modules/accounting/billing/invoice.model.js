const mongoose = require("mongoose");

// --- Subdocument for Invoice Items ---
const invoiceItemSchema = new mongoose.Schema(
    {
        productId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Product",
            required: true,
        },
        name: {
            type: String,
            required: true,
            trim: true,
        },
        // Meta
        reminderSent: { type: Boolean, default: false },
        overdueNoticeSent: { type: Boolean, default: false },
        overdueCount: { type: Number, default: 0 },

        hsnCode: { type: String, trim: true },
        quantity: { type: Number, required: true, min: 1 },
        unit: { type: String, trim: true, default: "pcs" },
        price: { type: Number, required: true, min: 0 },
        discount: { type: Number, default: 0 },
        taxRate: { type: Number, default: 0 },
    },
    { _id: false },
);

// --- Main Invoice Schema ---
const invoiceSchema = new mongoose.Schema(
    {
        // --- Core Links ---
        organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
        branchId: { type: mongoose.Schema.Types.ObjectId, ref: "Branch", index: true },
        customerId: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", index: true },
        saleId: { type: mongoose.Schema.Types.ObjectId, ref: "Sales" },

        // --- Invoice Info ---
        invoiceNumber: { type: String, required: true, trim: true, uppercase: true, index: true },
        invoiceDate: { type: Date, default: Date.now },
        dueDate: { type: Date },
        status: { type: String, enum: ["draft", "issued", "paid", "cancelled"], default: "issued" },

        // --- Billing Details ---
        billingAddress: { type: String, trim: true },
        shippingAddress: { type: String, trim: true },
        placeOfSupply: { type: String, trim: true },

        // --- Items ---
        items: [invoiceItemSchema],

        // --- Totals ---
        subTotal: { type: Number, default: 0 },
        totalTax: { type: Number, default: 0 },
        totalDiscount: { type: Number, default: 0 },
        roundOff: { type: Number, default: 0 },
        grandTotal: { type: Number, required: true, default: 0 },

        // --- Payment Info ---
        paymentStatus: { type: String, enum: ["unpaid", "partial", "paid"], default: "unpaid" },
        paidAmount: { type: Number, default: 0 },
        balanceAmount: { type: Number, default: 0 },
        paymentMethod: { type: String, enum: ["cash", "bank", "credit", "upi", "other"], default: "cash" },
        
        // ⚠️ ADDED: To store Cheque No / UPI Ref on the invoice doc itself
        paymentReference: { type: String, trim: true }, 
        transactionId: { type: String, trim: true },

        // --- E-Invoice / Tax Metadata ---
        gstType: { type: String, enum: ["intra-state", "inter-state", "export"], default: "intra-state" },
        irnNumber: { type: String, trim: true },
        qrCode: { type: String, trim: true },

        // --- Files & Notes ---
        notes: { type: String, trim: true },
        attachedFiles: [{ type: String, trim: true }],

        // --- Audit ---
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        isDeleted: { type: Boolean, default: false },
    },
    { timestamps: true },
);

// --- Indexes ---
invoiceSchema.index({ organizationId: 1, invoiceNumber: 1 }, { unique: true });
invoiceSchema.index({ organizationId: 1, invoiceDate: -1 });
invoiceSchema.index({ organizationId: 1, branchId: 1, invoiceDate: -1 });
invoiceSchema.index({ organizationId: 1, createdAt: -1 });
invoiceSchema.index({ organizationId: 1, customerId: 1 });

// --- Virtuals & Middleware ---
invoiceSchema.virtual("totalQuantity").get(function () {
    if (!this.items || this.items.length === 0) return 0;
    return this.items.reduce((acc, item) => acc + item.quantity, 0);
});

invoiceSchema.pre("save", function (next) {
    if (this.isModified("items") || this.isModified("paidAmount")) {
        let subTotal = 0;
        let totalTax = 0;
        let totalDiscount = 0;

        this.items.forEach((item) => {
            const lineTotal = item.price * item.quantity;
            totalDiscount += item.discount || 0;
            totalTax += ((item.taxRate || 0) / 100) * (lineTotal - (item.discount || 0));
            subTotal += lineTotal;
        });

        const grand = subTotal + totalTax - totalDiscount + (this.roundOff || 0);
        this.subTotal = subTotal;
        this.totalTax = totalTax;
        this.totalDiscount = totalDiscount;
        this.grandTotal = Math.round(grand);
        this.balanceAmount = this.grandTotal - (this.paidAmount || 0);

        if (this.balanceAmount <= 0) this.paymentStatus = "paid";
        else if (this.paidAmount > 0 && this.balanceAmount > 0) this.paymentStatus = "partial";
        else this.paymentStatus = "unpaid";
    }
    next();
});

const Invoice = mongoose.model("Invoice", invoiceSchema);
module.exports = Invoice;
// const mongoose = require("mongoose");

// // --- Subdocument for Invoice Items ---
// const invoiceItemSchema = new mongoose.Schema(
//     {
//         productId: {
//             type: mongoose.Schema.Types.ObjectId,
//             ref: "Product",
//             required: true,
//         },
//         name: {
//             type: String,
//             required: true,
//             trim: true,
//         },

//         // inside invoiceSchema
//         reminderSent: {
//             type: Boolean,
//             default: false, // for upcoming due-date reminders (paymentReminderService)
//         },
//         overdueNoticeSent: {
//             type: Boolean,
//             default: false, // for overdue reminders (overdueReminderService)
//         },
//         overdueCount: {
//             type: Number,
//             default: 0, // how many overdue emails were sent
//         },

//         hsnCode: {
//             type: String,
//             trim: true,
//         },
//         quantity: {
//             type: Number,
//             required: true,
//             min: 1,
//         },
//         unit: {
//             type: String,
//             trim: true,
//             default: "pcs",
//         },
//         price: {
//             type: Number,
//             required: true,
//             min: 0,
//         },
//         discount: {
//             type: Number,
//             default: 0,
//         },
//         taxRate: {
//             type: Number,
//             default: 0, // e.g., 18% GST
//         },
//     },
//     { _id: false },
// );

// // --- Main Invoice Schema ---
// const invoiceSchema = new mongoose.Schema(
//     {
//         // --- Core Links ---
//         organizationId: {
//             type: mongoose.Schema.Types.ObjectId,
//             ref: "Organization",
//             required: true,
//             index: true,
//         },
//         branchId: {
//             type: mongoose.Schema.Types.ObjectId,
//             ref: "Branch",
//             index: true,
//         },
//         customerId: {
//             type: mongoose.Schema.Types.ObjectId,
//             ref: "Customer",
//             index: true,
//         },
//         saleId: {
//             type: mongoose.Schema.Types.ObjectId,
//             ref: "Sales",
//         },

//         // --- Invoice Info ---
//         invoiceNumber: {
//             type: String,
//             required: true,
//             trim: true,
//             uppercase: true,
//             index: true,
//         },
//         invoiceDate: {
//             type: Date,
//             default: Date.now,
//         },
//         dueDate: {
//             type: Date,
//         },
//         status: {
//             type: String,
//             enum: ["draft", "issued", "paid", "cancelled"],
//             default: "issued",
//         },

//         // --- Billing Details ---
//         billingAddress: {
//             type: String,
//             trim: true,
//         },
//         shippingAddress: {
//             type: String,
//             trim: true,
//         },
//         placeOfSupply: {
//             type: String,
//             trim: true,
//         },

//         // --- Items ---
//         items: [invoiceItemSchema],

//         // --- Totals ---
//         subTotal: {
//             type: Number,
//             default: 0,
//         },
//         totalTax: {
//             type: Number,
//             default: 0,
//         },
//         totalDiscount: {
//             type: Number,
//             default: 0,
//         },
//         roundOff: {
//             type: Number,
//             default: 0,
//         },
//         grandTotal: {
//             type: Number,
//             required: true,
//             default: 0,
//         },

//         // --- Payment Info ---
//         paymentStatus: {
//             type: String,
//             enum: ["unpaid", "partial", "paid"],
//             default: "unpaid",
//         },
//         paidAmount: {
//             type: Number,
//             default: 0,
//         },
//         balanceAmount: {
//             type: Number,
//             default: 0,
//         },
//         paymentMethod: {
//             type: String,
//             enum: ["cash", "bank", "credit", "upi", "other"],
//             default: "cash",
//         },
//         // --- E-Invoice / Tax Metadata ---
//         gstType: {
//             type: String,
//             enum: ["intra-state", "inter-state", "export"],
//             default: "intra-state",
//         },
//         irnNumber: {
//             type: String,
//             trim: true,
//         },
//         qrCode: {
//             type: String, // e-invoice QR code image URL
//             trim: true,
//         },

//         // --- Files & Notes ---
//         notes: {
//             type: String,
//             trim: true,
//         },
//         attachedFiles: [
//             {
//                 type: String, // PDF invoice, supporting docs
//                 trim: true,
//             },
//         ],

//         // --- Audit Trail ---
//         createdBy: {
//             type: mongoose.Schema.Types.ObjectId,
//             ref: "User",
//         },
//         updatedBy: {
//             type: mongoose.Schema.Types.ObjectId,
//             ref: "User",
//         },

//         // --- Soft Delete ---
//         isDeleted: {
//             type: Boolean,
//             default: false,
//         },
//     },
//     { timestamps: true },
// );

// // --- Indexes ---
// // REMOVED DUPLICATE: organizationId + customerId was listed twice. Kept only one instance below.
// invoiceSchema.index({ organizationId: 1, invoiceNumber: 1 }, { unique: true });
// invoiceSchema.index({ organizationId: 1, invoiceDate: -1 });
// invoiceSchema.index({ organizationId: 1, branchId: 1, invoiceDate: -1 });

// // Add these if missing to make dashboards 100x faster
// invoiceSchema.index({ organizationId: 1, createdAt: -1 }); // For "Recent Sales" dashboard
// invoiceSchema.index({ organizationId: 1, customerId: 1 }); // For "Customer History"
// invoiceSchema.index({ invoiceNumber: 1, organizationId: 1 }, { unique: true }); // Prevent duplicate numbers

// // --- Virtual Field: Total Quantity ---
// invoiceSchema.virtual("totalQuantity").get(function () {
//     if (!this.items || this.items.length === 0) return 0;
//     return this.items.reduce((acc, item) => acc + item.quantity, 0);
// });

// // --- Pre-save Hook: Auto Totals ---
// invoiceSchema.pre("save", function (next) {
//     if (this.isModified("items") || this.isModified("paidAmount")) {
//         let subTotal = 0;
//         let totalTax = 0;
//         let totalDiscount = 0;

//         this.items.forEach((item) => {
//             const lineTotal = item.price * item.quantity;
//             totalDiscount += item.discount || 0;
//             totalTax +=
//                 ((item.taxRate || 0) / 100) *
//                 (lineTotal - (item.discount || 0));
//             subTotal += lineTotal;
//         });

//         const grand =
//             subTotal + totalTax - totalDiscount + (this.roundOff || 0);
//         this.subTotal = subTotal;
//         this.totalTax = totalTax;
//         this.totalDiscount = totalDiscount;
//         this.grandTotal = Math.round(grand);
//         this.balanceAmount = this.grandTotal - (this.paidAmount || 0);

//         // Auto update payment status
//         if (this.balanceAmount <= 0) this.paymentStatus = "paid";
//         else if (this.paidAmount > 0 && this.balanceAmount > 0)
//             this.paymentStatus = "partial";
//         else this.paymentStatus = "unpaid";
//     }
//     next();
// });

// const Invoice = mongoose.model("Invoice", invoiceSchema);
// module.exports = Invoice;
