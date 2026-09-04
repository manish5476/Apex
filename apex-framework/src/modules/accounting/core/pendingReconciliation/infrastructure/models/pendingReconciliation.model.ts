const mongoose = require('mongoose');
const { getConnection } = require('../../../../../../core/database');

const pendingReconciliationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    // TODO: add PendingReconciliation-specific fields here
  },
  { timestamps: true }
);

const conn = getConnection(process.env.PENDINGRECONCILIATION_DB_NAME || 'pendingReconciliation_db');

module.exports = conn.model('PendingReconciliation', pendingReconciliationSchema);
