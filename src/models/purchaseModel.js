const mongoose = require('mongoose');

// --- Subdocument for Individual Product Line Items ---
const purchaseItemSchema = new mongoose.Schema({
    productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true,
    },
    // --- ADDED: For historical accuracy ---
    name: {
        type: String,
        required: true,
    },
    quantity: {
        type: Number,
        required: true,
        min: 1,
    },
    purchasePrice: {
        type: Number,
        required: true,
        min: 0,
    },
    taxRate: {
        type: Number,
        default: 0,
    },
    discount: {
        type: Number,
        default: 0,
    },
    // --- REMOVED: Redundant, as the pre-save hook calculates totals ---
    // total: {
    //     type: Number,
    //     required: true,
    //     min: 0,
    // }
}, { _id: false });

// --- Main Purchase Schema ---
const purchaseSchema = new mongoose.Schema({
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
    supplierId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Supplier',
        required: true,
        index: true,
    },

    // --- Purchase Details ---
    invoiceNumber: {
        type: String,
        trim: true,
        uppercase: true,
        index: true,
    },
    purchaseDate: {
        type: Date,
        default: Date.now,
    },
    dueDate: {
        type: Date,
    },
    status: {
        type: String,
        enum: ['draft', 'received', 'cancelled'],
        default: 'draft',
    },

    // --- Items ---
    items: [purchaseItemSchema],

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

    // --- Audit Trail ---
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },

    // --- Meta ---
    notes: {
        type: String,
        trim: true,
    },
    // --- ADDED BACK: For GST bill uploads ---
    attachedFiles: [{
        type: String, // Array of URLs
        trim: true,
    }],
    isDeleted: {
        type: Boolean,
        default: false,
    },

}, { timestamps: true });

// --- Indexing ---
purchaseSchema.index({ organizationId: 1, supplierId: 1 });
purchaseSchema.index({ organizationId: 1, invoiceNumber: 1 }, { unique: true, sparse: true });

// --- Virtual Field: Total Quantity ---
purchaseSchema.virtual('totalQuantity').get(function() {
    if (!this.items || this.items.length === 0) return 0;
    return this.items.reduce((acc, item) => acc + item.quantity, 0);
});

// --- Middleware to Auto-Calculate Totals ---
purchaseSchema.pre('save', function(next) {
    if (this.isModified('items') || this.isModified('paidAmount')) {
        let subTotal = 0;
        let totalTax = 0;
        let totalDiscount = 0;

        this.items.forEach(item => {
            const itemTotal = item.purchasePrice * item.quantity;
            subTotal += itemTotal;
            totalDiscount += item.discount || 0;
            totalTax += ((item.taxRate || 0) / 100) * (itemTotal - (item.discount || 0)); // Tax after discount
        });

        this.subTotal = subTotal;
        this.totalTax = totalTax;
        this.totalDiscount = totalDiscount;
        this.grandTotal = subTotal + totalTax - totalDiscount;
        this.balanceAmount = this.grandTotal - (this.paidAmount || 0);
    }
    next();
});

const Purchase = mongoose.model('Purchase', purchaseSchema);
module.exports = Purchase;