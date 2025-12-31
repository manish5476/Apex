// src/models/salesReturnModel.js
const mongoose = require('mongoose');

const returnItemSchema = new mongoose.Schema({
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    name: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true },
    taxAmount: { type: Number, default: 0 },
    discountAmount: { type: Number, default: 0 },
    refundAmount: { type: Number, required: true } // Total for this line (qty * price + tax - discount)
}, { _id: false });

const salesReturnSchema = new mongoose.Schema({
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
    
    // Link to original sale
    invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice', required: true, index: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
    
    returnNumber: { type: String, required: true, unique: true }, // e.g., RET-0001
    returnDate: { type: Date, default: Date.now },
    
    items: [returnItemSchema],
    
    // Financials
    subTotal: { type: Number, default: 0 },
    taxTotal: { type: Number, default: 0 },
    totalRefundAmount: { type: Number, required: true },
    
    reason: { type: String, required: true },
    status: { type: String, enum: ['approved', 'rejected'], default: 'approved' },
    
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

module.exports = mongoose.model('SalesReturn', salesReturnSchema);
