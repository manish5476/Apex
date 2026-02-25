// models/pendingReconciliationModel.js
const mongoose = require('mongoose');

const pendingReconciliationSchema = new mongoose.Schema({
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true
  },
  invoiceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Invoice',
    required: true
  },
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer'
  },
  
  // Payment details from external system
  externalTransactionId: String,
  externalReference: String,
  amount: Number,
  paymentDate: Date,
  paymentMethod: String,
  gateway: String,
  rawData: Object, // Store original payment data
  
  // Reconciliation status
  status: {
    type: String,
    enum: ['pending', 'matched', 'unmatched', 'failed'],
    default: 'pending'
  },
  matchedEmiId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'EMI'
  },
  matchedInstallments: [Number], // Installment numbers matched
  
  // Manual reconciliation fields
  notes: String,
  reconciledBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  reconciledAt: Date,
  
  // Metadata
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: Date
}, { timestamps: true });

const PendingReconciliation = mongoose.model('PendingReconciliation', pendingReconciliationSchema);
module.exports = PendingReconciliation;