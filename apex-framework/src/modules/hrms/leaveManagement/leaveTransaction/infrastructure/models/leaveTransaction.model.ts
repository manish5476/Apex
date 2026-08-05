const mongoose = require('mongoose');
const { getConnection } = require('../../../../../../core/database');

const leaveTransactionSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    // TODO: add LeaveTransaction-specific fields here
  },
  { timestamps: true }
);

const conn = getConnection(process.env.LEAVETRANSACTION_DB_NAME || 'leaveTransaction_db');

module.exports = conn.model('LeaveTransaction', leaveTransactionSchema);
