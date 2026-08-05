const mongoose = require('mongoose');
const { getConnection } = require('../../../../../../core/database');

const leaveRequestSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    // TODO: add LeaveRequest-specific fields here
  },
  { timestamps: true }
);

const conn = getConnection(process.env.LEAVEREQUEST_DB_NAME || 'leaveRequest_db');

module.exports = conn.model('LeaveRequest', leaveRequestSchema);
