const mongoose = require('mongoose');
const { getConnection } = require('../../../../../core/database');

const purchaseSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    // TODO: add Purchase-specific fields here
  },
  { timestamps: true }
);

const conn = getConnection(process.env.PURCHASE_DB_NAME || 'purchase_db');

module.exports = conn.model('Purchase', purchaseSchema);
