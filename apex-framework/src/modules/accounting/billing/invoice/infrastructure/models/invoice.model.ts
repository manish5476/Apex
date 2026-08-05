const mongoose = require('mongoose');
const { getConnection } = require('../../../../../../core/database');

const invoiceSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    // TODO: add Invoice-specific fields here
  },
  { timestamps: true }
);

const conn = getConnection(process.env.INVOICE_DB_NAME || 'invoice_db');

module.exports = conn.model('Invoice', invoiceSchema);
