const mongoose = require('mongoose');
const { getConnection } = require('../../../../../../core/database');

const attendanceSummarySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    // TODO: add AttendanceSummary-specific fields here
  },
  { timestamps: true }
);

const conn = getConnection(process.env.ATTENDANCESUMMARY_DB_NAME || 'attendanceSummary_db');

module.exports = conn.model('AttendanceSummary', attendanceSummarySchema);
