const mongoose = require('mongoose');
const { getConnection } = require('../../../../../core/database');

const salesReturnSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    // TODO: add SalesReturn-specific fields here
  },
  { timestamps: true }
);

const conn = getConnection(process.env.SALESRETURN_DB_NAME || 'salesReturn_db');

module.exports = conn.model('SalesReturn', salesReturnSchema);
