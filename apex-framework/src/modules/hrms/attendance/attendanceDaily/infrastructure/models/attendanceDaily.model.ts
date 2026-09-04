const mongoose = require('mongoose');
const { getConnection } = require('../../../../../../core/database');

const attendanceDailySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    // TODO: add AttendanceDaily-specific fields here
  },
  { timestamps: true }
);

const conn = getConnection(process.env.ATTENDANCEDAILY_DB_NAME || 'attendanceDaily_db');

module.exports = conn.model('AttendanceDaily', attendanceDailySchema);
