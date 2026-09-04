const mongoose = require('mongoose');
const { getConnection } = require('../../../../../../core/database');

const leaveBalanceSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    // TODO: add LeaveBalance-specific fields here
  },
  { timestamps: true }
);

const conn = getConnection(process.env.LEAVEBALANCE_DB_NAME || 'leaveBalance_db');

module.exports = conn.model('LeaveBalance', leaveBalanceSchema);
