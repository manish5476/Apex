const mongoose = require('mongoose');

const invoiceAuditSchema = new mongoose.Schema({
  invoiceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Invoice',
    required: true,
    index: true // Important for fast history lookups
  },
  // action: {
  //   type: String,
  //   required: true,
  //   enum: ['CREATE', 'UPDATE', 'STATUS_CHANGE', 'DELETE', 'EMAIL_SENT', 'DOWNLOADED']
  // },
  action: {
    type: String,
    enum: ['CREATE', 'UPDATE', 'STATUS_CHANGE', 'DELETE', 'EMAIL_SENT', 'DOWNLOADED', 'PAYMENT', 'CONVERT_DRAFT', 'UPDATE_DRAFT', 'UPDATE_FINANCIAL', 'CANCEL'],
  },
  performedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  details: {
    type: String, // Human readable summary e.g., "Changed status from Pending to Paid"
    required: true
  },
  meta: {
    type: Object, // Optional: Store technical diffs like { oldTotal: 100, newTotal: 200 }
    default: {}
  },
  ipAddress: String,
  userAgent: String
}, {
  timestamps: true // Automatically gives you createdAt (the timestamp of the event)
});

const InvoiceAudit = mongoose.model('InvoiceAudit', invoiceAuditSchema);
module.exports = InvoiceAudit;