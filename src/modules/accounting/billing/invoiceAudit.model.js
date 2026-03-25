const mongoose = require('mongoose');

const invoiceAuditSchema = new mongoose.Schema({

  // FIX #1 — CRITICAL: Added organizationId (was completely missing).
  // Without this, you cannot query audit logs per-tenant without first joining
  // to Invoice — a huge performance and multi-tenancy isolation problem.
  // Required for GDPR/compliance data isolation per organization.
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true,
  },

  invoiceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Invoice',
    required: true,
    index: true,
  },

  action: {
    type: String,
    enum: [
      'CREATE', 'UPDATE', 'PAYMENT_ADDED', 'STATUS_CHANGE',
      'DELETE', 'EMAIL_SENT', 'DOWNLOADED', 'PAYMENT',
      'CONVERT_DRAFT', 'UPDATE_DRAFT', 'UPDATE_FINANCIAL', 'CANCEL',
    ],
    required: true, // FIX #2 — action should be required; an audit log without an action type is meaningless
  },

  performedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },

  details: {
    type: String,
    required: true,
  },

  meta: {
    type: Object,
    default: {},
  },

  ipAddress: String,
  userAgent:  String,

}, {
  timestamps: true,
});

// ─────────────────────────────────────────────
//  Indexes
// ─────────────────────────────────────────────

// FIX #3 — Compound index for tenant-scoped audit log listing (most common query pattern)
invoiceAuditSchema.index({ organizationId: 1, createdAt: -1 });

// FIX #4 — Index for fetching full history of a specific invoice (very common)
invoiceAuditSchema.index({ organizationId: 1, invoiceId: 1, createdAt: -1 });

// FIX #5 — Index for compliance queries: "all actions by a specific user"
invoiceAuditSchema.index({ organizationId: 1, performedBy: 1, createdAt: -1 });

const InvoiceAudit = mongoose.model('InvoiceAudit', invoiceAuditSchema);
module.exports = InvoiceAudit;



// const mongoose = require('mongoose');

// const invoiceAuditSchema = new mongoose.Schema({
//   invoiceId: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: 'Invoice',
//     required: true,
//     index: true // Important for fast history lookups
//   },
//   action: {
//     type: String,
//     enum: ['CREATE', 'UPDATE','PAYMENT_ADDED', 'STATUS_CHANGE', 'DELETE', 'EMAIL_SENT', 'DOWNLOADED', 'PAYMENT', 'CONVERT_DRAFT', 'UPDATE_DRAFT', 'UPDATE_FINANCIAL', 'CANCEL'],
//   },
//   performedBy: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: 'User',
//     required: true
//   },
//   details: {
//     type: String, // Human readable summary e.g., "Changed status from Pending to Paid"
//     required: true
//   },
//   meta: {
//     type: Object, // Optional: Store technical diffs like { oldTotal: 100, newTotal: 200 }
//     default: {}
//   },
//   ipAddress: String,
//   userAgent: String
// }, {
//   timestamps: true // Automatically gives you createdAt (the timestamp of the event)
// });

// const InvoiceAudit = mongoose.model('InvoiceAudit', invoiceAuditSchema);
// module.exports = InvoiceAudit;