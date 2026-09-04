const mongoose = require('mongoose');
const { getConnection } = require('../../../../../../core/database');

const payslipSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    // TODO: add Payslip-specific fields here
  },
  { timestamps: true }
);

const conn = getConnection(process.env.PAYSLIP_DB_NAME || 'payslip_db');

module.exports = conn.model('Payslip', payslipSchema);
