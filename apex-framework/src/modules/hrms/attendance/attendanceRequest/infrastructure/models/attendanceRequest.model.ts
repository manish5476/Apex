const mongoose = require('mongoose');
const { getConnection } = require('../../../../../../core/database');

const attendanceRequestSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    // TODO: add AttendanceRequest-specific fields here
  },
  { timestamps: true }
);

const conn = getConnection(process.env.ATTENDANCEREQUEST_DB_NAME || 'attendanceRequest_db');

module.exports = conn.model('AttendanceRequest', attendanceRequestSchema);
