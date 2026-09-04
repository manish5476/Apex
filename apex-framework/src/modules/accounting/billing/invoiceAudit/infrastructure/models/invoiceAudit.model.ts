const mongoose = require('mongoose');
const { getConnection } = require('../../../../../../core/database');

const invoiceAuditSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    // TODO: add InvoiceAudit-specific fields here
  },
  { timestamps: true }
);

const conn = getConnection(process.env.INVOICEAUDIT_DB_NAME || 'invoiceAudit_db');

module.exports = conn.model('InvoiceAudit', invoiceAuditSchema);
