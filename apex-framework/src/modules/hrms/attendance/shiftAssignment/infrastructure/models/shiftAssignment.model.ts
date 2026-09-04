const mongoose = require('mongoose');
const { getConnection } = require('../../../../../../core/database');

const shiftAssignmentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    // TODO: add ShiftAssignment-specific fields here
  },
  { timestamps: true }
);

const conn = getConnection(process.env.SHIFTASSIGNMENT_DB_NAME || 'shiftAssignment_db');

module.exports = conn.model('ShiftAssignment', shiftAssignmentSchema);
