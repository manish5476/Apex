const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
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
        index: true,
    },

    // --- Transaction Type ---
    type: {
        type: String,
        enum: ['inflow', 'outflow'], // inflow = received from customer, outflow = paid to supplier
        required: true,
    },

    // --- References (depending on type) ---
    customerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Customer',
    },
    supplierId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Supplier',
    },
    invoiceId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Invoice',
    },
    purchaseId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Purchase',
    },

    // --- Payment Details ---
    paymentDate: {
        type: Date,
        default: Date.now,
    },
    referenceNumber: {
        type: String,
        trim: true,
        uppercase: true,
    },
    amount: {
        type: Number,
        required: [true, 'Payment amount is required'],
        min: 0,
    },
    paymentMethod: {
        type: String,
        enum: ['cash', 'bank', 'credit', 'upi', 'cheque', 'other'],
        default: 'cash',
    },
    transactionMode: {
        type: String,
        enum: ['manual', 'auto'], // auto = generated via invoice/purchase sync
        default: 'manual',
    },
    transactionId: {
        type: String,
        trim: true,
    },
    bankName: {
        type: String,
        trim: true,
    },
    remarks: {
        type: String,
        trim: true,
    },

    // --- Status ---
    status: {
        type: String,
        enum: ['pending', 'completed', 'failed', 'cancelled'],
        default: 'completed',
    },

    // --- Meta ---
    isDeleted: {
        type: Boolean,
        default: false,
    },

    // --- Audit Trail ---
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
    // --- Payment Allocation ---
    allocationStatus: {
        type: String,
        enum: ['unallocated', 'partially_allocated', 'fully_allocated'],
        default: 'unallocated'
    },

    allocatedTo: [{
        type: {
            type: String,
            enum: ['invoice', 'emi', 'advance', 'purchase', 'other']
        },
        documentId: mongoose.Schema.Types.ObjectId,
        emiId: mongoose.Schema.Types.ObjectId,
        installmentNumber: Number,
        amount: Number,
        allocatedAt: Date
    }],

    remainingAmount: {
        type: Number,
        default: function () { return this.amount; }
    }

}, { timestamps: true });

// --- Indexing ---
paymentSchema.index({ organizationId: 1, type: 1 });
paymentSchema.index({ customerId: 1 });
paymentSchema.index({ supplierId: 1 });
paymentSchema.index({ invoiceId: 1 });
paymentSchema.index({ purchaseId: 1 });
paymentSchema.index({ organizationId: 1, paymentDate: -1 });

// --- Virtual: Transaction Direction ---
paymentSchema.virtual('direction').get(function () {
    return this.type === 'inflow' ? 'Received from Customer' : 'Paid to Supplier';
});

// --- Middleware: Normalize ---
paymentSchema.pre('save', function (next) {
    if (this.referenceNumber) this.referenceNumber = this.referenceNumber.trim().toUpperCase();
    next();
});

const Payment = mongoose.model('Payment', paymentSchema);
module.exports = Payment;
