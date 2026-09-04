const mongoose = require('mongoose');
const { getConnection } = require('../../../../../../core/database');

const attendanceMachineSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    // TODO: add AttendanceMachine-specific fields here
  },
  { timestamps: true }
);

const conn = getConnection(process.env.ATTENDANCEMACHINE_DB_NAME || 'attendanceMachine_db');

module.exports = conn.model('AttendanceMachine', attendanceMachineSchema);
