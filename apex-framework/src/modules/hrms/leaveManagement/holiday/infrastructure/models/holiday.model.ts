const mongoose = require('mongoose');
const { getConnection } = require('../../../../../../core/database');

const holidaySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    // TODO: add Holiday-specific fields here
  },
  { timestamps: true }
);

const conn = getConnection(process.env.HOLIDAY_DB_NAME || 'holiday_db');

module.exports = conn.model('Holiday', holidaySchema);
