const mongoose = require('mongoose');
const { getConnection } = require('../../../../../core/database');

const salesSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    // TODO: add Sales-specific fields here
  },
  { timestamps: true }
);

const conn = getConnection(process.env.SALES_DB_NAME || 'sales_db');

module.exports = conn.model('Sales', salesSchema);
