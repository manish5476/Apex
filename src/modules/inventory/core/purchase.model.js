const mongoose = require('mongoose');

const purchaseItemSchema = new mongoose.Schema({
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    name: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    purchasePrice: { type: Number, required: true, min: 0 },
    taxRate: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
}, { _id: false });

const purchaseSchema = new mongoose.Schema({
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },

    // --- Supplier Link & Snapshot (CRITICAL FOR AUDIT) ---
    supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true, index: true },
    supplierSnapshot: { // <--- Added this so if Supplier is deleted/changed, invoice remains valid
        name: String,
        address: String,
        gstNumber: String,
        email: String
    },

    invoiceNumber: { type: String, trim: true, uppercase: true, index: true },
    purchaseDate: { type: Date, default: Date.now },
    dueDate: { type: Date },

    status: { type: String, enum: ['draft', 'received', 'cancelled'], default: 'draft' },

    items: [purchaseItemSchema],

    // --- Financials ---
    subTotal: { type: Number, default: 0 },
    totalTax: { type: Number, default: 0 },
    totalDiscount: { type: Number, default: 0 },
    grandTotal: { type: Number, required: true, default: 0 },

    // --- Payment Tracking ---
    paymentStatus: { type: String, enum: ['unpaid', 'partial', 'paid', 'overpaid'], default: 'unpaid' },
    paidAmount: { type: Number, default: 0 },
    balanceAmount: { type: Number, default: 0 },

    // Note: This field is ambiguous if you have multiple payments (e.g. part cash, part bank).
    // Ideally rely on the Payment collection for this, but keeping it for "Preferred/Initial Method" is fine.
    paymentMethod: { type: String, enum: ['cash', 'bank', 'credit', 'upi', 'other'], default: 'cash' },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    notes: { type: String, trim: true },
    // NEW: Allow full object
    attachedFiles: [{
        url: { type: String, required: true },
        public_id: { type: String },
        format: { type: String },
        fileName: { type: String }
    }],
    // attachedFiles: [{ type: String, trim: true }],
    isDeleted: { type: Boolean, default: false },
}, { timestamps: true });

// --- Indexes ---
purchaseSchema.index({ organizationId: 1, supplierId: 1 });
purchaseSchema.index({ organizationId: 1, invoiceNumber: 1 }, { unique: true, sparse: true });
purchaseSchema.index({ organizationId: 1, purchaseDate: -1 });

// --- Virtuals ---
purchaseSchema.virtual('totalQuantity').get(function () {
    if (!this.items || this.items.length === 0) return 0;
    return this.items.reduce((acc, item) => acc + item.quantity, 0);
});

// --- Middleware: Auto-Calculate Financials & Status ---
purchaseSchema.pre('save', function (next) {
    // Only recalculate if items or paidAmount changed
    if (this.isModified('items') || this.isModified('paidAmount')) {
        let subTotal = 0;
        let totalTax = 0;
        let totalDiscount = 0;

        // 1. Calculate Items
        if (this.items && this.items.length > 0) {
            this.items.forEach(item => {
                const itemTotal = item.purchasePrice * item.quantity;
                const itemDiscount = item.discount || 0;

                subTotal += itemTotal;
                totalDiscount += itemDiscount;

                // Tax is usually applied on (Price - Discount)
                const taxableAmount = itemTotal - itemDiscount;
                totalTax += ((item.taxRate || 0) / 100) * taxableAmount;
            });
        }

        this.subTotal = subTotal;
        this.totalTax = totalTax;
        this.totalDiscount = totalDiscount;
        this.grandTotal = Math.round((subTotal + totalTax - totalDiscount) * 100) / 100; // Round to 2 decimals

        // 2. Calculate Balance
        // Ensure paidAmount is not undefined
        this.paidAmount = this.paidAmount || 0;
        this.balanceAmount = Math.round((this.grandTotal - this.paidAmount) * 100) / 100;

        // 3. AUTO-UPDATE STATUS (New Logic)
        // This removes the need to write if/else logic in your controllers
        if (this.balanceAmount <= 0 && this.paidAmount > 0) {
            this.paymentStatus = 'paid';
            if (this.balanceAmount < 0) this.paymentStatus = 'overpaid'; // Edge case handling
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
//     productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, },
//     name: { type: String, required: true, },
//     quantity: { type: Number, required: true, min: 1, },
//     purchasePrice: { type: Number, required: true, min: 0, },
//     taxRate: { type: Number, default: 0, },
//     discount: { type: Number, default: 0, },
// }, { _id: false });
// const purchaseSchema = new mongoose.Schema({
//     organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true, },
//     branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true, },
//     supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true, index: true, },
//     invoiceNumber: { type: String, trim: true, uppercase: true, index: true, },
//     purchaseDate: { type: Date, default: Date.now, },
//     dueDate: { type: Date, },
//     status: { type: String, enum: ['draft', 'received', 'cancelled'], default: 'draft', },
//     items: [purchaseItemSchema],
//     subTotal: { type: Number, default: 0, },
//     totalTax: { type: Number, default: 0, },
//     totalDiscount: { type: Number, default: 0, },
//     grandTotal: { type: Number, required: true, default: 0, },
//     paymentStatus: { type: String, enum: ['unpaid', 'partial', 'paid'], default: 'unpaid', },
//     paidAmount: { type: Number, default: 0, },
//     balanceAmount: { type: Number, default: 0, },
//     paymentMethod: { type: String, enum: ['cash', 'bank', 'credit', 'upi', 'other'], default: 'cash', },
//     createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, },
//     approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', },
//     notes: { type: String, trim: true, },
//     attachedFiles: [{ type: String,trim: true, }],
//     isDeleted: { type: Boolean, default: false, },
// }, { timestamps: true });

// purchaseSchema.index({ organizationId: 1, supplierId: 1 });
// purchaseSchema.index({ organizationId: 1, invoiceNumber: 1 }, { unique: true, sparse: true });
// purchaseSchema.index({ organizationId: 1, purchaseDate: -1 });
// purchaseSchema.virtual('totalQuantity').get(function () {
//     if (!this.items || this.items.length === 0) return 0;
//     return this.items.reduce((acc, item) => acc + item.quantity, 0);
// });
// purchaseSchema.pre('save', function (next) {
//     if (this.isModified('items') || this.isModified('paidAmount')) { let subTotal = 0; let totalTax = 0; let totalDiscount = 0; this.items.forEach(item => { const itemTotal = item.purchasePrice * item.quantity; subTotal += itemTotal; totalDiscount += item.discount || 0; totalTax += ((item.taxRate || 0) / 100) * (itemTotal - (item.discount || 0)) }); this.subTotal = subTotal; this.totalTax = totalTax; this.totalDiscount = totalDiscount; this.grandTotal = subTotal + totalTax - totalDiscount; this.balanceAmount = this.grandTotal - (this.paidAmount || 0); }
//     next();
// });
// const Purchase = mongoose.model('Purchase', purchaseSchema);
// module.exports = Purchase;