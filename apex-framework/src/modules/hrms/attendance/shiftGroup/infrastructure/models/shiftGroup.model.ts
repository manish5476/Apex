const mongoose = require('mongoose');
const { getConnection } = require('../../../../../../core/database');

const shiftGroupSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    // TODO: add ShiftGroup-specific fields here
  },
  { timestamps: true }
);

const conn = getConnection(process.env.SHIFTGROUP_DB_NAME || 'shiftGroup_db');

module.exports = conn.model('ShiftGroup', shiftGroupSchema);
