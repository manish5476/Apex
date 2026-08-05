const mongoose = require('mongoose');
const { getConnection } = require('../../../../../../core/database');

const taxDeductionSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    // TODO: add TaxDeduction-specific fields here
  },
  { timestamps: true }
);

const conn = getConnection(process.env.TAXDEDUCTION_DB_NAME || 'taxDeduction_db');

module.exports = conn.model('TaxDeduction', taxDeductionSchema);
