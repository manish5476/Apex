const mongoose = require('mongoose');
const { getConnection } = require('../../../../../../core/database');

const attendanceLogSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    // TODO: add AttendanceLog-specific fields here
  },
  { timestamps: true }
);

const conn = getConnection(process.env.ATTENDANCELOG_DB_NAME || 'attendanceLog_db');

module.exports = conn.model('AttendanceLog', attendanceLogSchema);
