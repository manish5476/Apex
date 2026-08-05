const mongoose = require('mongoose');
const { getConnection } = require('../../../../../../core/database');

const emiSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    // TODO: add Emi-specific fields here
  },
  { timestamps: true }
);

const conn = getConnection(process.env.EMI_DB_NAME || 'emi_db');

module.exports = conn.model('Emi', emiSchema);
