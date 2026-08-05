const mongoose = require('mongoose');
const { getConnection } = require('../../../../../core/database');

const stockTransferSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    // TODO: add StockTransfer-specific fields here
  },
  { timestamps: true }
);

const conn = getConnection(process.env.STOCKTRANSFER_DB_NAME || 'stockTransfer_db');

module.exports = conn.model('StockTransfer', stockTransferSchema);
