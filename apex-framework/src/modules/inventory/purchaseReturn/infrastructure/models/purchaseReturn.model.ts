const mongoose = require('mongoose');
const { getConnection } = require('../../../../../core/database');

const purchaseReturnSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    // TODO: add PurchaseReturn-specific fields here
  },
  { timestamps: true }
);

const conn = getConnection(process.env.PURCHASERETURN_DB_NAME || 'purchaseReturn_db');

module.exports = conn.model('PurchaseReturn', purchaseReturnSchema);
