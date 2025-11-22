const mongoose = require('mongoose');

// --- Subdocument for Individual Sold Products ---
const soldItemSchema = new mongoose.Schema({
    productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true,
    },
    name: {
        type: String,
        required: true,
        trim: true,
    },
    quantity: {
        type: Number,
        required: true,
        min: 1,
    },
    sellingPrice: {
        type: Number,
        required: true,
        min: 0,
    },
    discount: {
        type: Number,
        default: 0,
    },
    taxRate: {
        type: Number,
        default: 0,
    },
    // You can also store itemTotal if you want snapshot pricing,
    // but we’ll compute totals dynamically in a pre-save hook.
}, { _id: false });

// --- Main Sales Schema ---
const salesSchema = new mongoose.Schema({
    // --- Core Links ---
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
    customerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Customer',
    },

    // --- Invoice Info ---
    invoiceNumber: {
        type: String,
        trim: true,
        uppercase: true,
        index: true,
    },
    saleDate: {
        type: Date,
        default: Date.now,
    },
    dueDate: {
        type: Date,
    },
    status: {
        type: String,
        enum: ['draft', 'completed', 'cancelled'],
        default: 'completed',
    },

    // --- Sold Items ---
    items: [soldItemSchema],

    // --- Totals ---
    subTotal: {
        type: Number,
        default: 0,
    },
    totalTax: {
        type: Number,
        default: 0,
    },
    totalDiscount: {
        type: Number,
        default: 0,
    },
    grandTotal: {
        type: Number,
        required: true,
        default: 0,
    },

    // --- Payment Info ---
    paymentStatus: {
        type: String,
        enum: ['unpaid', 'partial', 'paid'],
        default: 'unpaid',
    },
    paidAmount: {
        type: Number,
        default: 0,
    },
    balanceAmount: {
        type: Number,
        default: 0,
    },
    paymentMethod: {
        type: String,
        enum: ['cash', 'bank', 'credit', 'upi', 'other'],
        default: 'cash',
    },

    // --- GST & Billing Info ---
    isTaxInclusive: {
        type: Boolean,
        default: false,
    },
    notes: {
        type: String,
        trim: true,
    },
    attachedFiles: [{
        type: String, // URLs for uploaded invoices or proofs
        trim: true,
    }],

    // --- Audit Trail ---
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
    approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },

    // --- Meta ---
    isDeleted: {
        type: Boolean,
        default: false,
    },

}, { timestamps: true });

// --- Indexing ---
salesSchema.index({ organizationId: 1, invoiceNumber: 1 }, { unique: true, sparse: true });
salesSchema.index({ organizationId: 1, customerId: 1 });
salesSchema.index({ organizationId: 1, saleDate: -1 });

// --- Virtual: Total Quantity ---
salesSchema.virtual('totalQuantity').get(function() {
    if (!this.items || this.items.length === 0) return 0;
    return this.items.reduce((acc, item) => acc + item.quantity, 0);
});

// --- Middleware: Auto-Calculate Totals ---
salesSchema.pre('save', function(next) {
    if (this.isModified('items') || this.isModified('paidAmount')) {
        let subTotal = 0;
        let totalTax = 0;
        let totalDiscount = 0;

        this.items.forEach(item => {
            const itemTotal = item.sellingPrice * item.quantity;
            totalDiscount += item.discount || 0;
            totalTax += ((item.taxRate || 0) / 100) * (itemTotal - (item.discount || 0));
            subTotal += itemTotal;
        });

        this.subTotal = subTotal;
        this.totalTax = totalTax;
        this.totalDiscount = totalDiscount;
        this.grandTotal = subTotal + totalTax - totalDiscount;
        this.balanceAmount = this.grandTotal - (this.paidAmount || 0);

        // Update payment status automatically
        if (this.balanceAmount <= 0) this.paymentStatus = 'paid';
        else if (this.paidAmount > 0 && this.balanceAmount > 0) this.paymentStatus = 'partial';
        else this.paymentStatus = 'unpaid';
    }
    next();
});

const Sales = mongoose.model('Sales', salesSchema);
module.exports = Sales;
