const mongoose = require('mongoose');
const { getConnection } = require('../../../../../../core/database');

const shiftSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    // TODO: add Shift-specific fields here
  },
  { timestamps: true }
);

const conn = getConnection(process.env.SHIFT_DB_NAME || 'shift_db');

module.exports = conn.model('Shift', shiftSchema);
